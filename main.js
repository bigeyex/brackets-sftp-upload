/*jshint node: true, jquery: true*/
/*!
 * Brackets Todo 0.5.3
 * Display all todo comments in current document or project.
 *
 * @author Mikael Jorhult
 * @license http://mikaeljorhult.mit-license.org MIT
 */
define(function (require, exports, module) {
	'use strict';

	// Get dependencies.
	var Async = brackets.getModule('utils/Async'),
		Menus = brackets.getModule('command/Menus'),
		CommandManager = brackets.getModule('command/CommandManager'),
		Commands = brackets.getModule('command/Commands'),
		PreferencesManager = brackets.getModule('preferences/PreferencesManager'),
		ProjectManager = brackets.getModule('project/ProjectManager'),
		EditorManager = brackets.getModule('editor/EditorManager'),
		DocumentManager = brackets.getModule('document/DocumentManager'),
		WorkspaceManager = brackets.getModule('view/WorkspaceManager'),
		Resizer = brackets.getModule('utils/Resizer'),
		AppInit = brackets.getModule('utils/AppInit'),
		FileUtils = brackets.getModule('file/FileUtils'),
		FileSystem = brackets.getModule('filesystem/FileSystem'),
		ExtensionUtils = brackets.getModule('utils/ExtensionUtils'),
		NodeDomain = brackets.getModule("utils/NodeDomain"),

		// Extension basics.
		COMMAND_ID = 'bigeyex.bracketsSFTPUpload.enable',
		COMMAND_ID_UPLOAD = 'bigeyex.bracketsSFTPUpload.upload',
		COMMAND_ID_UPLOAD_ALL = 'bigeyex.bracketsSFTPUpload.uploadAll',
		COMMAND_ID_DOWNLOAD_ALL = 'bigeyex.bracketsSFTPUpload.downloadAll',
		COMMAND_ID_VIEW_LOG = 'bigeyex.bracketsSFTPUpload.viewLog',
		COMMAND_ID_DOWNLOAD = 'bigeyex.bracketsSFTPUpload.download',
		COMMAND_ID_DOWNLOAD_FTP_WALK = 'bigeyex.bracketsSFTPUpload.downloadFtpWalk',
		
		Strings = require('modules/Strings'),
		dataStorage = require('modules/DataStorageManager'),
		settingsDialog = require('modules/SettingsDialog'),
		backupDialog = require('modules/BackupFilesDialog'),
		logsDialog = require('modules/LogViewerDialog'),

		// Preferences.
		preferences = PreferencesManager.getExtensionPrefs('bigeyex.bracketsSFTPUpload'),

		// Mustache templates.
		todoPanelTemplate = require('text!html/panel.html'),
		todoRowTemplate = require('text!html/row.html'),
		browserPanelTemplate = require('text!html/browser-panel.html'),

		// Setup extension.
		serverInfo, //sftp username/password etc;
		$todoPanel,
		projectUrl,
		$todoIcon = $('<a href="#" title="' + Strings.EXTENSION_NAME + '" id="brackets-sftp-upload-icon"></a>'),
		$statusIndicator,
		$browserPanel,
		
		// Get view menu.
		menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU),
		contextMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU),
		status = {
			is_downloading: false,
			itens_length: 0,
			itens_completed: 0,
			itens_ok: 0,
			itens_error: 0,
			_logs: [],

			reset: function (length, download) {
				this.is_downloading = (download === true);
				this.itens_error = 0;
				this.itens_ok = 0;
				this.itens_completed = 0;
				this.itens_length = length;
				this.queuing = false;
				this.queuing_fisined = false;
			},

			error: function (msg) {
				this.itens_error = this.itens_error + 1;
				this.itens_completed = this.itens_completed + 1;
				this.log('Error', msg);
			},

			downloaded: function (remoteFile, localFile) {
				this.itens_ok = this.itens_ok + 1;
				this.itens_completed = this.itens_completed + 1;
				this.log('Downloaded', localFile + ' --> ' + remoteFile);
			},

			uploaded: function (remoteFile, localFile) {
				this.itens_ok = this.itens_ok + 1;
				this.itens_completed = this.itens_completed + 1;
				this.log('Uploaded', localFile + ' --> ' + remoteFile);
			},

			log: function (type, text) {
				this._logs.push({
					type: type,
					text: text
				});
			},

			clearLog: function () {
				this._logs = [];
			},

			status: function () {
				var perc = this.itens_length > 0 ? Math.floor((this.itens_completed * 100) / this.itens_length) : 0;
				return (' ' + perc + '% (' + this.itens_ok + ' ok/' + this.itens_error + ' errors)' +
					(this.queuing === true ? '[Queuing ' + this.itens_length + '...]' : 
					(this.queuing_fisined === true ? '[Queued '+this.itens_length+']' : '')));
			}

		};

	// Define preferences.
	preferences.definePreference('enabled', 'boolean', false);

	// Get Node module domain
	var _domainPath = ExtensionUtils.getModulePath(module, "node/SftpUploadDomain");
	var _nodeDomain = new NodeDomain("sftpUpload", _domainPath);

	// Register extension.
	CommandManager.register(Strings.EXTENSION_NAME, COMMAND_ID, togglePanel);
	CommandManager.register(Strings.UPLOAD_MENU_NAME, COMMAND_ID_UPLOAD, uploadMenuAction);
	CommandManager.register(Strings.DOWNLOAD_MENU_NAME, COMMAND_ID_DOWNLOAD, downloadMenuAction);
	CommandManager.register(Strings.DOWNLOAD_MENU_NAME_FTP_WALK, COMMAND_ID_DOWNLOAD_FTP_WALK, downloadMenuActionFtpWalk);
	CommandManager.register(Strings.UPLOAD_ALL, COMMAND_ID_UPLOAD_ALL, uploadAllItems);
	CommandManager.register(Strings.BACKUP_ALL, COMMAND_ID_DOWNLOAD_ALL, startBackup);
	CommandManager.register(Strings.VIEW_LOG, COMMAND_ID_VIEW_LOG, viewLog);
	
	// Add command to menu.

	if (menu !== undefined) {
		menu.addMenuDivider();
		menu.addMenuItem(COMMAND_ID, 'Ctrl-Alt-Shift-U');
		menu.addMenuItem(COMMAND_ID_UPLOAD, 'Ctrl-Alt-U');
		menu.addMenuItem(COMMAND_ID_UPLOAD_ALL, 'Ctrl-Shift-U');
		//menu.addMenuItem(COMMAND_ID_DOWNLOAD_ALL, 'Ctrl-Alt-D');
		//menu.addMenuItem(COMMAND_ID_VIEW_LOG, 'Ctrl-Alt-V');
		menu.addMenuDivider();
	}

	if (contextMenu !== undefined) {
		contextMenu.addMenuDivider();
		contextMenu.addMenuItem(COMMAND_ID_UPLOAD);
		contextMenu.addMenuItem(COMMAND_ID_DOWNLOAD);
		contextMenu.addMenuItem(COMMAND_ID_DOWNLOAD_FTP_WALK);
	}

	// Load stylesheet.
	ExtensionUtils.loadStyleSheet(module, 'todo.css');

	/**
	 * Get saved serverInfo 
	 */
	function _getServerInfo() {
		var serverInfo = dataStorage.get('server_list');
		if ( ! serverInfo || serverInfo === undefined || serverInfo == "" )
			serverInfo = dataStorage.get('server_info');
		
		if ( typeof serverInfo === 'object' && serverInfo.hasOwnProperty('servers')) {
			return serverInfo.servers[serverInfo.selected_id];
		}
		else if ( typeof serverInfo === 'object') {
			if (serverInfo.backupPath === undefined) {
				serverInfo.name = "default";
				serverInfo.backupPath = settingsDialog.getFolder();
			}
			return serverInfo;
		}
		return false;
	}

	/**
	 * Set state of extension.
	 */
	// this is a menu item
	function togglePanel() {
		var enabled = preferences.get('enabled');

		enablePanel(!enabled);
	}

	/**
		Upload from Project Explorer Context Menu
	*/
	function uploadMenuAction() {
		var item = ProjectManager.getSelectedItem(),
			projectUrl = ProjectManager.getProjectRoot().fullPath,
			remotePath = item.fullPath.replace(projectUrl, '');
		if (item.isFile) {
			uploadItem(item.fullPath, remotePath);
		} else {
			uploadDirectory(item.fullPath, remotePath);
		}
	}

	/**
		Download from Project Explorer Context Menu
	*/
	function downloadMenuAction() {
		var item = ProjectManager.getSelectedItem(),
			projectUrl = ProjectManager.getProjectRoot().fullPath,
			remotePath = item.fullPath.replace(projectUrl, '');
		
		setUpDownLoadFolder(function(folder) {
			if ( item.isFile ) {
				downloadFile(remotePath, folder +'/'+ FileUtils.getBaseName(item.fullPath), false, true);	
			}
			else {
				downloadFile(remotePath, folder, item.fullPath, false);
			}
		});
	}
	
	/**
		Download from Project Explorer Context Menu
	*/
	function downloadMenuActionFtpWalk() {
		var item = ProjectManager.getSelectedItem(),
			projectUrl = ProjectManager.getProjectRoot().fullPath,
			remotePath = item.fullPath.replace(projectUrl, '');
		
		setUpDownLoadFolder(function(folder) {
			if ( item.isFile ) {
				downloadFile(remotePath, folder +'/'+ FileUtils.getBaseName(item.fullPath), false, true);	
			}
			else {
				downloadFile(remotePath, folder, true, false);
			}
		});
	}
	
	/**
	* Resize Browser Panel
	*/
	function resizeBrowserPanel() {
		$browserPanel.height(($("#editor-holder").height() - 24) + 'px');
	}
	
	/**
	 * Initialize extension.
	 */
	function enablePanel(enabled) {
		if (enabled) {
			loadSettings(function () {
				// Show panel.
				Resizer.show($todoPanel);
			});
			
			// Set active class on icon.
			$todoIcon.addClass('active');
			enableButtons();
		} else {
			// Hide panel.
			Resizer.hide($todoPanel);

			// Remove active class from icon.
			$todoIcon.removeClass('active');
		}

		// Save enabled state.
		preferences.set('enabled', enabled);
		preferences.save();

		// Mark menu item as enabled/disabled.
		CommandManager.get(COMMAND_ID).setChecked(enabled);
	}
	
	// this is called every time the panel opens.
	function loadSettings(callback) {
		var changedFiles = dataStorage.get('changed_files'),
			serverInfo = _getServerInfo(),
			files = [],
			projectUrl = ProjectManager.getProjectRoot().fullPath;
				
		$("button.btn-server-setup").html(Strings.SERVER + ': <b>'+ 
										  (serverInfo ? serverInfo.name : ' ') +'</b>');
				
		for (var filepath in changedFiles) {
			files.push({
				path: filepath,
				file: filepath.replace(projectUrl, '')
			});
		}

		$('#sftp-upload-tbody').empty().append(Mustache.render(todoRowTemplate, {
			strings: Strings,
			files: files
		}));

		$('#sftp-upload-tbody tr').off().on('click', function () {
			var fullPath = $(this).attr('x-file');
			CommandManager.execute(Commands.FILE_OPEN, {
				fullPath: fullPath
			});
		});

		$('#sftp-upload-tbody .upload-button').off().on('click', function (e) {
			uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
			e.stopPropagation();
		});

		$('#sftp-upload-tbody .skip-button').off().on('click', function (e) {
			skipItem($(this).attr('x-file'));
			e.stopPropagation();
		});

		if (callback) {
			callback();
		}
	}

	// Toggle Loading Icon
	function showUploadingIconStatus(status) {
		if (status) {
			$todoIcon.addClass('uploading');
		} else {
			$todoIcon.removeClass('uploading');
		}
	}

	// upload ONE file to the server
	function uploadItem(localPath, remotePath) {
		var serverInfo = _getServerInfo();
		status.reset(1);
		showUploadingIconStatus(true);
		_nodeDomain.exec('upload', localPath, remotePath, serverInfo).fail(function (err) {
			showUploadingIconStatus(false);
			updateStatus(err);
		});
	}

	// upload ONE dir to the server
	function uploadDirectory(localPath, remotePath) {
		status.reset();
		status.queuing = true;
		var serverInfo = _getServerInfo();
		showUploadingIconStatus(true);
		_nodeDomain.exec('uploadDirectory', localPath, remotePath, serverInfo).fail(function (err) {
			status.log('Error', err);
			showUploadingIconStatus(false);
			updateStatus(err);
		});
	}

	// upload all files in the panel to the server
	function uploadAllItems() {
		var serverInfo = _getServerInfo(),
			trs = $('#brackets-sftp-upload tr .upload-button'),
			filelist = [];
		for (var i = 0; i < trs.length; i++) {
			var $el = $(trs[i]);
			filelist.push({
				localPath: $el.attr('x-file'),
				remotePath: $el.attr('r-file')
			});
		}

		status.reset(filelist.length);

		showUploadingIconStatus(true);
		_nodeDomain.exec('uploadAll', filelist, serverInfo).fail(function (err) {
			showUploadingIconStatus(false);
			updateStatus(err);
		});
	}

	// backup all files in the panel to a folder
	function downloadAllItems(toFolder) {

		var serverInfo = _getServerInfo(),
			trs = $('#brackets-sftp-upload tr .upload-button'),
			filelist = [],
			projectUrl = ProjectManager.getProjectRoot().fullPath,
			basePath = _getBackupFullPath(serverInfo, toFolder);

		for (var i = 0; i < trs.length; i++) {
			var $el = $(trs[i]),
				filePath = $el.attr('x-file').replace(projectUrl, '');

			filelist.push({
				localPath: (basePath + filePath),
				remotePath: $el.attr('r-file')
			});
		}

		status.reset(filelist.length, true);

		disableButtons();
		_nodeDomain.exec('downloadAll', filelist, serverInfo)
			.fail(function (err) {
				status.is_downloading = false;
				showUploadingIconStatus(false);
				updateStatus(err);
				enableButtons();
			});
	}

	// Opens dialog to make backup
	function setUpDownLoadFolder(callback) {
		var serverInfo = _getServerInfo(),
			path = _getBackupFullPath(serverInfo, '');
		
		if ( path ) backupDialog.showDialog(serverInfo, callback, path);
	}
	
	// Get the full path of the backup folder
	function _getBackupFullPath(serverInfo, folder, isFile) {
		var projectUrl = ProjectManager.getProjectRoot().fullPath,
			basePath;

		if ( ! serverInfo ) {
			backupDialog.showMessage(Strings.NO_SERVER_SETUP, Strings.SERVER_SETUP_NEDEED);
			return false;
		}
		else if ( !serverInfo.backupPath || serverInfo.backupPath === undefined || serverInfo.backupPath === "" ) {
			backupDialog.showMessage(Strings.NO_SERVER_SETUP, Strings.NO_BACKUP_FOLDER);
			return false;
		}
		
		if (serverInfo.backupPath.indexOf(":") > -1) { // full dir
			basePath = serverInfo.backupPath + folder + (isFile !== true ? "/" : '');
		} else {
			basePath = projectUrl + serverInfo.backupPath + "/" + folder + (isFile !== true ? "/" : '');
		}
		// replace any '//' to '/'
		basePath = basePath.replace(/\/+/g, "/");
		return basePath;
	}

	function startBackup() {
		setUpDownLoadFolder(downloadAllItems);
	}
	
	function downloadFile(remotePath, localPath, walkPath, isFile) {
		
		var config = _getServerInfo(),
			basePath = _getBackupFullPath(config, localPath, isFile);

		status.is_downloading = true;
		disableButtons();
		
		_nodeDomain.exec('download', remotePath, basePath, walkPath, config)
			.fail(function (err) {
				status.is_downloading = false;
				showUploadingIconStatus(false);
				updateStatus(err);
				enableButtons();
			});
	}
	
	function listRemoteDir(remotePath) {
		var config = _getServerInfo();
		status.status('Listing...');
		$browserPanel.show();
		resizeBrowserPanel();
		_nodeDomain.exec('list', remotePath || '', config)
			.fail(function (err) {
				status.log('Error', err);
			});
	}
	
	function startServerBrowser() {
		var config = _getServerInfo();
		$("div.sftp-update-browser-holder > span", $browserPanel).html(config.serverPath);
		$("div.sftp-update-browser-holder > ul", $browserPanel).empty();
		listRemoteDir();
	}
		
	function showListedItems(err, path, files) {
		var html = '';
		files.sort(function(a,b) {
			if ( a.type == 1 && b.type !== 1 ) return -1;
			else if ( a.type === 0 && b.type === 1 ) return 1;
			else {
				if(a.name < b.name) return -1;
				else if(a.name > b.name) return 1;	
				else return 0;
			}		
		}).forEach(function(file) {
			var css = '';
			if ( file.type == 1 ) { // folder
				css += 'folder';
			}
			html += '<li class="'+css+'" data-path="'+path+file.name+'"><label>'+file.name+'</label></li>';
		});
		
		var $mainUl = $(".sftp-update-browser-holder > ul", $browserPanel);
		
		if ( $mainUl.is(':empty') ) {
			$mainUl.append(html);
		}
		else {
			var $li = $('li[data-path="'+path+'"]', $mainUl);
			if ( $li ) {
				$li.append('<ul>'+html+'</ul');
			}
		}
	}
	
	// Test Server Connection
	function testConnection(serverInfo) {
		settingsDialog.updateStatus(Strings.TEST_CONNECTION_STARTING);
		_nodeDomain.exec('testConnection', serverInfo)
			.fail(function (err) {
				settingsDialog.updateStatus(Strings.TEST_CONNECTION_FAILED + ":" + err);
			});
	}

	// Disable all buttons in the panel
	function disableButtons() {
		$('#brackets-sftp-upload button').attr('disabled', 'disabled');
	}

	// Enable all buttons in the panel
	function enableButtons() {
		$('#brackets-sftp-upload button').removeAttr('disabled');
	}

	// Remove item from the changed files list
	function skipItem(path) {
		var changedFiles = dataStorage.get('changed_files') || {};
		$('#brackets-sftp-upload tr[x-file="' + path + '"]').remove();
		if (path in changedFiles) {
			delete changedFiles[path];
			dataStorage.set('changed_files', changedFiles);
		}
	}

	// Remove all itens from the changed files list
	function skipAllItems() {
		$('#brackets-sftp-upload tr').remove();
		dataStorage.set('changed_files', {});
	}

	// Upda₢te Panel Status
	function updateStatus(status) {
		$('#brackets-sftp-upload .status-stab').text(status);
	}
	/**
	 * Listen for save or refresh and look for todos when needed.
	 */
	function registerListeners() {
		var $documentManager = $(DocumentManager),
			$projectManager = $(ProjectManager);

		// Listeners bound to Brackets modules.
		DocumentManager.on('documentSaved.todo', function (event, document) {
				//TODO: add current document to change list
				var path = document.file.fullPath,
					projectUrl = ProjectManager.getProjectRoot().fullPath,
					serverInfo = _getServerInfo(),
					changedFiles = dataStorage.get('changed_files') || {};

				if (changedFiles === null) {
					changedFiles = {};
				}
				if ( !serverInfo && serverInfo !== null && serverInfo.uploadOnSave) {
					uploadItem(path, path.replace(projectUrl, ''));
					return;
				}
				if (!(path in changedFiles)) {
					changedFiles[path] = 1;
					dataStorage.set('changed_files', changedFiles);
					$('#sftp-upload-tbody').append(Mustache.render(todoRowTemplate, {
						strings: Strings,
						files: [{
							path: path,
							file: path.replace(projectUrl, '')
						}]
					}));

					$('#sftp-upload-tbody .upload-button').off().on('click', function (e) {
						uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
						e.stopPropagation();
					});

					$('#sftp-upload-tbody .skip-button').off().on('click', function (e) {
						skipItem($(this).attr('x-file'));
						e.stopPropagation();
					});
				}

			});

		ProjectManager.on('projectOpen', function(prj) {
			loadSettings(function() {
				
			});
		});
	}

	/* Open Log Viewer Dialog */
	function viewLog() {
		logsDialog.showDialog(status._logs, function () {
			status.clearLog();
		});
	}

	// Register panel and setup event listeners.
	AppInit.appReady(function () {
		var panelHTML = Mustache.render(todoPanelTemplate, {
			strings: Strings
		});
		
		// Create and cache todo panel.
		WorkspaceManager.createBottomPanel('bigeyex.bracketsSFTPUpload.panel', $(panelHTML), 100);
		$todoPanel = $('#brackets-sftp-upload');

		// Close panel when close button is clicked.
		$todoPanel
			.on('click', '.close', function () {
				enablePanel(false);
			});

		// Setup listeners.
		registerListeners();

		$browserPanel = $(Mustache.render(browserPanelTemplate, {
			Strings: Strings
		}));
		$("#main-toolbar").before($browserPanel);
		
		$browserPanel.on('click', '.close', function () {
			$browserPanel.hide();
		})
		.on('click', 'li.folder', function(evt) {
			evt.stopPropagation();
			var $li = $(this);
			$li.toggleClass("open");
			if ( $li.hasClass("open") ) {
				var path = $li.data("path");
				listRemoteDir(path);
			}
			else {
				$li.children('ul').remove();
			}
		});
		
		// Add listener for toolbar icon..
		$todoIcon.click(function () {
			CommandManager.execute(COMMAND_ID);
		}).appendTo('#main-toolbar .buttons');
		
		$todoPanel.on('click', '.btn-server-setup', function () {
			settingsDialog.showDialog({
				testConnection: testConnection,
				serverSelected: function(server) {
					$("button.btn-server-setup").html(Strings.SERVER+': <b>'+ server.name+'</b>');
				}
			});
		})
		.on('click', '.btn-server-browse', function() {
			startServerBrowser();
		})
		.on('click', '.btn-upload-all', function () {
			uploadAllItems();
		})
		.on('click', '.btn-skip-all', function () {
			skipAllItems();
		})
		.on('click', '.btn-backup-all', function () {
			setUpDownLoadFolder(downloadAllItems);
		})
		.on('click', '.status-stab', function () {
			viewLog();
		});

		// Enable extension if loaded last time.
		if (preferences.get('enabled')) {
			enablePanel(true);
		}
		
		$(_nodeDomain).on('uploading', function (err, msg) {
				updateStatus('Uploading: ' + msg + status.status());
			})
			.on('downloading', function (err, remoteFile, localFile) {
				updateStatus('Downloading: ' + remoteFile + status.status());
			})
			.on('uploaded', function (err, remoteFile, localFile) {
				skipItem(localFile);
				status.uploaded(remoteFile, localFile);
				updateStatus('Finished: ' + remoteFile + status.status());
			})
			.on('downloaded', function (err, remoteFile, localFile) {
				status.downloaded(remoteFile, localFile);
				updateStatus('Downloaded: ' + remoteFile);
			})
			.on('connection-tested', function (err, ok, msg) {
				if (ok) {
					settingsDialog.updateStatus(Strings.TEST_CONNECTION_SUCCESS);
				} else {
					settingsDialog.updateStatus(Strings.TEST_CONNECTION_FAILED + '<span class="sftp-conn-error">' + msg + '</span>');
					status.log('Error', msg);
				}
			})
			.on('queued', function(err, num) {
				status.itens_length = num;
			})
			.on('queuedend', function(err, num) {
				status.itens_length = num;
				status.queuing = false;
				status.queuing_fisined = true;
			})
			.on('listed', function(err, path, list) {
				showListedItems(err, path, list);
			})
			.on('error', function (err, msg) {
				status.error(msg);
				updateStatus('Error: ' + msg);
			})
			.on('jobCompleted', function (err, msg) {
				showUploadingIconStatus(false);
				if (status.is_downloading) {
					updateStatus('Backup Complete! ' + status.status());
				} else {
					updateStatus('Upload Complete! ' + status.status());
				}
				status.is_downloading = false;
				enableButtons();
			});
	});
});
