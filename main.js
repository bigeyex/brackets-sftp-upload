/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window, Mustache */
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
		Mustache = brackets.getModule("thirdparty/mustache/mustache"),
		Resizer = brackets.getModule('utils/Resizer'),
		AppInit = brackets.getModule('utils/AppInit'),
		FileUtils = brackets.getModule('file/FileUtils'),
		FileSystem = brackets.getModule('filesystem/FileSystem'),
		ExtensionUtils = brackets.getModule('utils/ExtensionUtils'),
		NodeDomain = brackets.getModule("utils/NodeDomain"),
		StatusBar = brackets.getModule('widgets/StatusBar'),

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
		transactionRowTemplate = require('text!html/row-transaction.html'),
		browserPanelTemplate = require('text!html/browser-panel.html'),
		indicatorTemplate = require('text!html/indicator.html'),

		// Setup extension.
		serverInfo, //sftp username/password etc;
		$todoPanel,
		projectUrl,
		$todoIcon = $('<a href="#" title="' + Strings.EXTENSION_NAME + '" id="brackets-sftp-upload-icon"></a>'),
		$statusIndicator,
		$browserPanel,
		$indicator,
		
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

			selectedServer: undefined,
			$status: undefined,
			$indicator: undefined,

			init : function() {
                this.$status = $('#brackets-sftp-upload .status-stab');
                this.$indicator = $('div.indicator-label', $indicator);
				this.reset();
			},

			reset: function () {
				this.is_downloading = false;
				this.itens_error = 0;
				this.itens_ok = 0;
				this.itens_completed = 0;
				this.itens_length = 0;
				this.queuing = false;
				this.queuing_fisined = false;
				$("#sftp-transactions-tbody").empty();
				this.status();
			},

			error: function (msg, jobId) {
				this.itens_error = this.itens_error + 1;
				this.itens_completed = this.itens_completed + 1;
				this.log('Error', msg);

				// Update transaction
				var $tr = this.getTransactionRow(jobId);
				$tr.removeClass("processing")
					.addClass("error")
					.children('td.status')
					.html( msg );

				$tr = $('#sftp-upload-tbody tr[data-job-id="'+jobId+'"]');
				if ( $tr.length === 1 ) {
					$tr.find('button').removeProp('disabled');
				}

				// Modification TR
				$tr = this.getModificationRow(jobId);
				$tr.find("button").removeProp("disabled").first().text(Strings.UPLOAD);

				this.status();
			},

			getTransactionRow: function(jobId) {
				return $('tr[data-job-id='+jobId+']', $("#sftp-transactions-tbody"));
			},

			getModificationRow: function(jobId) {
				return $('#sftp-upload-tbody tr[data-job-id='+jobId+']');
			},

			jobQueued: function(job) {
				this.queuing_fisined = false;
				this.queuing = true;
				this.itens_length = this.itens_length + 1;
				if ( job.type == "upload" ) job.signal = "-->";
				else job.signal = "<--";
				job.status = Strings.QUEUED;

				$("#sftp-transactions-tbody").append(Mustache.render(transactionRowTemplate, job));
				var $tr = $('#sftp-upload-tbody tr[x-file="'+job.localPath+'"]');
				if ( $tr.length === 1 ) {
					$tr.attr('data-job-id', job.id).find('button').prop('disabled', 'disabled').first().text(Strings.QUEUED);
				}
				this.status();
			},

			queueEnded: function(num) {
				this.queuing = false;
				this.queuing_fisined = true;
				status.status();
			},

			processing: function(jobId) {
				var $tr = this.getTransactionRow(jobId);
				$tr.addClass("processing")
					.children('td.status')
					.html( Strings.PROCESSING );

				$tr = this.getModificationRow(jobId);
				$tr.find("button").prop("disabled", "disabled").first().text(Strings.PROCESSING);

				status.status($tr.find('td.filename').text());
			},

			completed: function(jobId) {
				this.itens_ok = this.itens_ok + 1;
				this.itens_completed = this.itens_completed + 1;
				var $tr = this.getTransactionRow(jobId);
				$tr.removeClass("processing")
					.addClass("completed")
					.children('td.status')
					.html( Strings.FINISHED );

				this.status($tr.children('td.localPath').text());
				if ( $tr.data('type')  === 'upload' ) {
					var $trMod = this.getModificationRow(jobId),
						path = $trMod.attr('x-file');

					$trMod.addClass("success").find("td:last").text(Strings.FINISHED);
					skipItem(path);
				}
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

			status: function (text) {
				text = text || "";
				var server = this.selectedServer !== undefined && this.selectedServer !== false ? this.selectedServer.name : Strings.NO_SERVER_SETUP,
					perc = this.itens_length > 0 ? Math.floor((this.itens_completed * 100) / this.itens_length) : 0,
					perc_erro = this.itens_error > 0 ? Math.floor((this.itens_error * 100) / this.itens_error) : 0,
					strIndicator = this.itens_length === 0 ? server : (perc + '%'),
					css_class = perc_erro === 100 ? 'error' :
									(perc_erro === 0 && perc === 100 ? 'success' :
										(perc_erro > 0 ? 'warn' : '')),
					strStatus = text + (this.itens_length > 0 ? (('(' + this.itens_ok + ' ok/' + this.itens_error + ' errors)' +
						(this.queuing === true ? ('[ ' + Strings.QUEUING  + ' ' + this.itens_length + '...]' ) :
						(this.queuing_fisined === true ? ('[' + Strings.QUEUED + ' ' +this.itens_length+']') : '')))) : Strings.NO_QUEUE);

				this.$status.removeClass('error warn success').addClass(css_class).html(strStatus);
				this.$indicator.removeClass('error warn success').addClass(css_class).html(strIndicator);
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
		if ( ! serverInfo || serverInfo === undefined || serverInfo === "" )
			serverInfo = dataStorage.get('server_info');
		
		if ( typeof serverInfo === 'object' && serverInfo.hasOwnProperty('servers')) {
			return serverInfo.servers[serverInfo.selected_id];
		}
		else if ( typeof serverInfo === 'object') {
			if ( serverInfo.backupPath === undefined || serverInfo.backup === undefined ) {
				if ( serverInfo.backupPath === undefined ) serverInfo.name = "default";
				serverInfo.backup = {
					enabled: false,
					path: serverInfo.backupPath || settingsDialog.getFolder(),
					byDate: true,
					alwaysPrompt: false
				};
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
				
		status.selectedServer = serverInfo;

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
		//status.reset(1);
		showUploadingIconStatus(true);
		_nodeDomain.exec('upload', localPath, remotePath, serverInfo);
	}

	// upload ONE dir to the server
	function uploadDirectory(localPath, remotePath) {
		//status.reset();
		status.queuing = true;
		var serverInfo = _getServerInfo();
		showUploadingIconStatus(true);
		_nodeDomain.exec('uploadDirectory', localPath, remotePath, serverInfo);
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

		//status.reset(filelist.length);

		showUploadingIconStatus(true);
		_nodeDomain.exec('uploadAll', filelist, serverInfo);
	}

	// backup all files in the panel to a folder
	function downloadAllItems(toFolder) {
		var serverInfo = _getServerInfo(),
			trs = $('#brackets-sftp-upload tr .upload-button'),
			filelist = [],
			projectUrl = ProjectManager.getProjectRoot().fullPath;

		for (var i = 0; i < trs.length; i++) {
			var $el = $(trs[i]),
				filePath = $el.attr('x-file').replace(projectUrl, '');

			filelist.push({
				localPath: (toFolder + filePath),
				remotePath: $el.attr('r-file')
			});
		}

		_nodeDomain.exec('downloadAll', filelist, serverInfo);
	}

	// Opens dialog to make backup
	function setUpDownLoadFolder(callback, forBackup) {
		var serverInfo = _getServerInfo(),
			path = forBackup !== false ? _getBackupFullPath(serverInfo, '') : dataStorage.getProjectUrl();
		
		if ( path ) backupDialog.showDialog(serverInfo, callback, path );
	}
	
	// Get the full path of the backup folder
	function _getBackupFullPath(serverInfo, folder, isFile) {
		var projectUrl = ProjectManager.getProjectRoot().fullPath,
			basePath;

		if ( ! serverInfo ) {
			backupDialog.showMessage(Strings.NO_SERVER_SETUP, Strings.SERVER_SETUP_NEDEED);
			return false;
		}
		else if ( serverInfo.backup === undefined || !serverInfo.backup.path || serverInfo.backup.path === undefined || serverInfo.backup.path === "" ) {
			backupDialog.showMessage(Strings.NO_SERVER_SETUP, Strings.NO_BACKUP_FOLDER);
			return false;
		}
		folder = folder || '';
		var path = serverInfo.backup.path;

		if (path.lastIndexOf("/") !== path.length-1) {
			path += "/";
		}
		
		if ( serverInfo.backup.byDate ) path += backupDialog.getDateFolderName();

		if ( path.indexOf("/") === 0 || path.indexOf(":") > -1) { // full dir
			basePath = path + folder + (isFile !== true ? "/" : '');
		} else {
			basePath = projectUrl + path + "/" + folder + (isFile !== true ? "/" : '');
		}
		// replace any '//' to '/'
		basePath = basePath.replace(/\/+/g, "/");
		return basePath;
	}

	function startBackup() {
		var objServer = _getServerInfo();
		if ( objServer.backup.alwaysPrompt !== false ) {
			setUpDownLoadFolder(downloadAllItems);
		}
		else {
			var path = _getBackupFullPath(objServer);
			downloadAllItems(path);
		}
	}
	
	function downloadFile(remotePath, localPath, walkPath, isFile) {
		var config = _getServerInfo();
		_nodeDomain.exec('download', remotePath, localPath, walkPath, config);
	}
	
	function listRemoteDir(remotePath) {
		var config = _getServerInfo();
		status.status('Listing...');
		$browserPanel.show();
		resizeBrowserPanel();
		_nodeDomain.exec('list', remotePath || '', config);
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
			}else {
				css += 'file';
			}
			html += '<li class="'+css+'" data-path="'+path+'/'+file.name+'"><label>'+file.name+'</label></li>';
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

	/**
	 * Listen for save or refresh and look for todos when needed.
	 */
	function registerListeners() {
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
				if ( serverInfo && serverInfo !== null && serverInfo.uploadOnSave) {
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
				}
			});

		ProjectManager.on('projectOpen', function(prj) {
			dataStorage.setProjectUrl(ProjectManager.getProjectRoot().fullPath);
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

	// Shows browser panel context menu
	function showContextMenu(evt, $li) {
		var path = $li.data('path'),
			type = $li.hasClass("folder") ? "folder" : 'file',
			isOpen = type === 'folder' && $li.hasClass('open'),
			actions = {
				'folder' : [
					{action: 'toggle-folder', label: (isOpen ? Strings.CLOSE : Strings.OPEN) + " " + Strings.FOLDER},
					{action: 'download-folder', label: Strings.DOWNLOAD + " " + Strings.FOLDER}
				],
				'file': [
					{action: 'download-file', label: Strings.DOWNLOAD + " " + Strings.FILE}
				]
			},
			html = '<ul class="dropdown-menu dropdownbutton-popup sftp-browser-context-menu" tabindex="1">';

		actions = actions[type];
		for(var i=0,il=actions.length, a;i<il;i++) {
			a = actions[i];
			html += '<li data-action="'+a.action+'"><a href="#">' + a.label + '</a></li>';
		}

		html += '</ul>';

		var $ul = $(html);

		$ul.appendTo("body").css({
			position: 'absolute',
			top: evt.pageY +'px',
			left: evt.pageX +'px',
			'z-index': 9999
		});

		$ul.on('mousedown', 'a', function(evt) {
			evt.stopPropagation();
			evt.preventDefault();
			var $a = $(this),
				act = $a.parent().data("action");
			if (act === "download-file") {
				setUpDownLoadFolder(function(folder) {
					downloadFile(path, folder, false, true);
				}, false);
			}
			else if (act === 'download-folder') {
				setUpDownLoadFolder(function(folder) {
					downloadFile(path, folder, true, false);
				}, false);
			}
			else if (act === 'toggle-folder') {
				$li.trigger('click');
			}
			$ul.remove();
		})
		.on('blur', function(evt){
			$(this).remove();
		})
		.focus();

	}

	// Register panel and setup event listeners.
	AppInit.appReady(function () {
		var panelHTML = Mustache.render(todoPanelTemplate, {
			strings: Strings
		});
		
		dataStorage.setProjectUrl(ProjectManager.getProjectRoot().fullPath);

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

		$indicator = $(Mustache.render(indicatorTemplate, {
			Strings: Strings
		}));
		StatusBar.addIndicator('bigeyex.sftpUpload.connIndicator', $indicator, true, 'brackets-sftp-upload-indicator');
		$indicator.on('click', function() {
			viewLog();
		});
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
		})
		.on('contextmenu', 'li', function(evt) {
			showContextMenu(evt, $(this));
		});
		
		$('#sftp-upload-tbody')
			.on('click', '.upload-button', function (e) {
				uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
				e.stopPropagation();
			})
			.on('click', '.skip-button', function (e) {
				skipItem($(this).attr('x-file'));
				e.stopPropagation();
			})
			.on('click', function () {
				var fullPath = $(this).attr('x-file');
				CommandManager.execute(Commands.FILE_OPEN, {
					fullPath: fullPath
				});
			});

		// Add listener for toolbar icon..
		$todoIcon.click(function () {
			CommandManager.execute(COMMAND_ID);
		}).appendTo('#main-toolbar .buttons');
		
		$todoPanel.on('click', '.btn-server-setup', function () {
			settingsDialog.showDialog({
				testConnection: testConnection,
				serverSelected: function(server) {
					status.selectedServer = server;
					status.status();
					if ( server !== undefined && server !== false ) {
						$("button.btn-server-setup").html(Strings.SERVER+': <b>'+ server.name+'</b>');
					}
					else {
						$("button.btn-server-setup").html(Strings.NO_SERVER_SETUP);
					}
				}
			});
		})
		.on('click', '.tabs > ul > li', function() {
			var $li = $(this),
				tab = $li.data('tab'),
				$tab = $('div.table-container.'+tab, $todoPanel);

			$tab.addClass("selected").siblings('.table-container').removeClass("selected");
			$li.addClass("selected").siblings('li.selected').removeClass("selected");
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
			startBackup();
		})
		.on('click', '.btn-clear-all', function () {
			status.reset();
		})
		.on('click', '.status-stab', function () {
			viewLog();
		});

		// Enable extension if loaded last time.
		if (preferences.get('enabled')) {
			enablePanel(true);
		}
		
		// init status comp
		status.init();

		// Register for node events
		_nodeDomain
			.on('processing', function(err, jobId) {
				status.processing(jobId);
			})
			.on('processed', function(err, jobId) {
				status.completed(jobId);
			})
			.on('connection-tested', function (err, ok, msg) {
				if (ok) {
					settingsDialog.updateStatus(Strings.TEST_CONNECTION_SUCCESS);
				} else {
					settingsDialog.updateStatus(Strings.TEST_CONNECTION_FAILED + '<span class="sftp-conn-error">' + msg + '</span>');
					status.log('Error', msg);
				}
			})
			.on('queued', function(err, job) {
				$("button.btn-clear-all", $todoPanel).prop("disabled", true);
				status.jobQueued(job);
			})
			.on('queuedend', function(err, num) {
				status.queueEnded(num);
			})
			.on('listed', function(err, path, list) {
				showListedItems(err, path, list);
			})
			.on('error', function (err, msg, jobId) {
				status.error(msg, jobId);
			})
			.on('jobCompleted', function (err, msg) {
				showUploadingIconStatus(false);
				status.is_downloading = false;
				status.status();
				enableButtons();
				$("button.btn-clear-all", $todoPanel).removeProp("disabled");
			});
	});
});
