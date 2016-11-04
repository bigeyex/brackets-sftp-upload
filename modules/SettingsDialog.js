/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window */
define( function( require, exports ) {
    'use strict';
    
    // Get module dependencies.
    var Dialogs = brackets.getModule( 'widgets/Dialogs' ),
        FileSystem = brackets.getModule( 'filesystem/FileSystem' ),
		Mustache = brackets.getModule("thirdparty/mustache/mustache"),

        // Extension modules.
        Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        settingsDialogTemplate = require( 'text!../html/dialog-settings.html' ),
        
        // Variables.
        dialog,
        HasPortChanged,
        defaultSFTPport = 22,
        defaultFTPport  = 21,
        defaultBackUpPath = 'sftp-backups',
		itensToRemove = [];
    
    /**
     * Set each value of the preferences in dialog.
     */
    function setValues( values ) {
    }
    
    /**
     * Exposed method to get the backup folder name
     */
    exports.getFolder = function() {
        return dialog !== undefined ? $(".input-backup-path", dialog.getElement()).val() : defaultBackUpPath;
    };
    /**
     * Initialize dialog values.
     */
    function init() {

        $('#sftpupload-settings-dialog').on('change', '.input-method', function(){
            var protcolType = $('#sftpupload-settings-dialog .input-method').val();
            var port = $('#sftpupload-settings-dialog .input-port');
            if(protcolType == 'sftp' && port.val() == defaultFTPport && !HasPortChanged){
                port.val(defaultSFTPport);
            }
            else if(protcolType == 'ftp' && port.val() == defaultSFTPport && !HasPortChanged){
                port.val(defaultFTPport);
            }
        })
		.on('chamge', '.input-port', function(evt){
            HasPortChanged = true;
        })
		.on('change', 'input-backup-enabled').change(function(){
            if ( $(this).is(':checked')) {
				$(this).parents('.checkbox').next('fieldset').show();
			}
			else {
				$(this).parents('.checkbox').next('fieldset').hide();
			}
        })
		.on('contextmenu', '#sftpuoload-settings-server-list > li', function(evt) {

		});
    }
    
    function newServerObj() {
        return { __id: 0, name: "default", method:'sftp', host:'', port:defaultSFTPport, username:'', rsaPath:'', password:'', serverPath:'', uploadOnSave:0, backupPath: defaultBackUpPath,
			backup: {
				enabled: false,
				byDate: true,
				path: defaultBackUpPath,
				alwaysPrompt: false
			}
	   };
    }
	
	function saveServer(serverInfo) {
		var serverList = dataStorage.get('server_list');

		if ( !serverInfo.__id || parseInt(serverInfo.__id) === 0 ) {
			serverList.server_ids = serverList.server_ids + 1;
			serverInfo.__id = serverList.server_ids;
		}
		
		serverList.servers[serverInfo.__id] = serverInfo;
		serverList.selected_id = serverInfo.__id;
		
		$('.input-id', dialog.getElement()).val(serverInfo.__id);
		
		dataStorage.set('server_list', serverList);
		
		updateList(serverList);
	}
	
	function updateList(serverList) {
		serverList = serverList ||  dataStorage.get('server_list');
		var html = '';
		for(var i in serverList.servers) {
			if ( i !== undefined && parseInt(i) > 0 ) {
				var sv = serverList.servers[i];
				html += '<li data-id="'+sv.__id+'"' + (sv.__id == serverList.selected_id ? ' class="selected" ' : '') + '>' +
						sv.name +
						'<a href="#" class="close">x</a>' +
					'</li>';
			}
		}
		$("#sftpuoload-settings-server-list").html(html);
	}
    
	function getFormInfo() {
		var $dialog = dialog.getElement();

		return {
			__id: $('.input-id', $dialog).val(),
			name: $('.input-name', $dialog).val(),
			method: $('.input-method', $dialog).val(),
			host: $('.input-host', $dialog).val(),
			port: $('.input-port', $dialog).val(),
			username: $('.input-username', $dialog).val(),
			rsaPath: $('.input-rsa-path', $dialog).val(),
			password: $('.input-password', $dialog).val(),
			serverPath: $('.input-server-path', $dialog).val(),
			uploadOnSave: $('.input-save', $dialog).is(':checked'),
			backup: {
				enabled: $('.input-backup-enabled', $dialog).is(':checked'),
				path: $('.input-backup-path', $dialog).val(),
				byDate: $('.input-backup-by-day', $dialog).is(':checked'),
				alwaysPrompt:$('.input-backup-prompt', $dialog).is(':checked')
			}
		};	
	}

	function clearForm() {
		var $dialog = dialog.getElement();
		$('input:text', $dialog).val('');
		$('.input-id', $dialog).val(0);
		$('.input-port', $dialog).val(defaultFTPport);
		$('input[type=checkbox]', $dialog).removeProp('checked');
	}
	
	function fillForm(serverInfo) {
		var $dialog = dialog.getElement();
        if(serverInfo.uploadOnSave){
            $('.input-save', $dialog).prop('checked', true);
        }
        $('.input-method', $dialog).val(serverInfo.method);
		$('.input-id', $dialog).val(serverInfo.__id);
		$('.input-name', $dialog).val(serverInfo.name);
		$('.input-method', $dialog).val(serverInfo.method);
		$('.input-host', $dialog).val(serverInfo.host);
		$('.input-port', $dialog).val(serverInfo.port);
		$('.input-username', $dialog).val(serverInfo.username);
		$('.input-rsa-path', $dialog).val(serverInfo.rsaPath);
		$('.input-password', $dialog).val(serverInfo.password);
		$('.input-server-path', $dialog).val(serverInfo.serverPath);

		if ( serverInfo.backup !== undefined ) {
			$('.input-backup-path', $dialog).val(serverInfo.backup.path);

			if ( serverInfo.backup.enabled === true ) {
				$('.input-backup-enabled', $dialog).prop('checked', true).parents('.checkbox').next('fieldset').show();
			}
			else {
				$('.input-backup-enabled', $dialog).parents('.checkbox').next('fieldset').hide();
			}
			if ( serverInfo.backup.byDate ) $('.input-backup-by-day', $dialog).prop('checked', true);
			if ( serverInfo.backup.alwaysPrompt ) $('.input-backup-prompt', $dialog).prop('checked', true);
		}
		else {
			$('.input-backup-path', $dialog).val(serverInfo.backupPath);
		}
	}

	/**
     * Exposed method to update footer status
     */
	exports.updateStatus = function(status) {
		if ( dialog !== undefined ) {
			$("label.test-connection-status", dialog.getElement()).html(status);	
		}
	};
    
	/**
     * Exposed method to show dialog.
     */
    exports.showDialog = function(opts) {
		var self = this,
		_defaults = {
			testConnection: undefined, // function(serverInfo)
			serverSelected: undefined, // function(serverInfo)
		};

		dataStorage.refreshProjectUrl();

        // Compile dialog template.
        var serverInfo = dataStorage.get('server_info'),
			serverList = dataStorage.get('server_list'),
			selectedServerName = dataStorage.get('selected_server_name'),
			selectedServer = false;
		
		// Alreasy has list
		if ( typeof serverList === 'object' && serverList.selected_id > -1  ) {
            selectedServer = serverList.servers[serverList.selected_id];
		}
        // No setup at all
	 	else if (!serverInfo || typeof serverInfo !== 'object' ) {
            serverInfo = {
                selected_id: false,
                server_ids: 0,
                servers: {}
            };
			dataStorage.set('server_list', serverInfo);
		}
		// First time setting up with server list (Back compatibility)
		else if ( serverInfo && typeof serverInfo === 'object' && !serverInfo.hasOwnProperty('server_ids')){
            serverList = {
                 selected_id: 1,
                 server_ids: 1,
                 servers: {
                     '1' : $.extend(true, {}, serverInfo, {
                        __id: 1,
                        name: "default",
                        backupPath: defaultBackUpPath
                    })
                }
            };
			dataStorage.set('server_list', serverList);
            selectedServer = serverList.servers[serverList.selected_id];
        }
				
		if (!selectedServer) {
			selectedServer = newServerObj();
		}
		
        var compiledTemplate = Mustache.render(settingsDialogTemplate, {
            Strings: Strings,
            info: selectedServer
        });
		
        // Save dialog to variable.
        dialog = Dialogs.showModalDialogUsingTemplate( compiledTemplate, false );
        
        // Initialize dialog values.
        init();
        
        HasPortChanged = false;
        
		var removeServer = function(id) {
			itensToRemove.push(id);
			self.updateStatus(Strings.SETTINGS_DIALOG_SAVE_TO_APLLY);
			$("#sftp-upload-settings-list-menu").hide();
		};

        $('#sftpuoload-settings-server-list').off('click', 'li').on('click','li', function(evt){
            var $li = $(this),
				serverId = $(this).data('id'),
				info = dataStorage.get('server_list'),
				server = info.servers[serverId];
			
			info.selected_id = serverId;
			dataStorage.set('server_list', info);
			$li.addClass('selected').siblings().removeClass('selected');
			fillForm(server);
			opts.serverSelected(server);

			$("#sftp-upload-settings-list-menu").show();
        })
		.on('click', 'li > a.close', function(evt) {
			evt.stopPropagation();
			removeServer($(this).parent().data('id'));
			$(this).parent().remove();
		});

		fillForm(selectedServer);
        
		updateList(serverList);
		
        // manually handle ESC Key and buttons because of autoDismiss = false
        $(dialog.getElement())
        .off('keyup')
        .on('keyup', function(evt) { 
            if ( evt.keyCode === 27 ) {
                dialog.close();
				itensToRemove = [];
            }
        })
        .off('click', 'button')
        .on('click', 'button', function(evt) {
            var $btn = $(this),
				buttonId = $btn.data('button-id');
            if ( buttonId === 'ok' ) {
				itensToRemove = [];
                saveServer(getFormInfo());
                dialog.close();
            }
			else if ( buttonId === 'clone') {
				var newObj = getFormInfo();
				newObj.__id = 0;
				saveServer(newObj);
				updateList();
			}
			else if ( buttonId === 'remove') {
				removeServer(getFormInfo().__id);
				$('#sftpuoload-settings-server-list li.selected').remove();
			}
			else if (buttonId === 'save') {
				if ( itensToRemove.length > 0 ) {
					var list = dataStorage.get('server_list');
					for(var i=0,il=itensToRemove.length;i<il;i++) {
						delete list.servers[itensToRemove[i]];
						if ( list.selected_id == itensToRemove[i] ) {
							list.selected_id = 0;
							clearForm();
							opts.serverSelected(false);
						}
					}
					dataStorage.set('server_list', list);
					itensToRemove = [];
				}
				else {
					saveServer(getFormInfo());
				}
				self.updateStatus(Strings.SETTINGS_DIALOG_SAVED);
			}
            else if (buttonId === 'test') {
                opts.testConnection.call(self, getFormInfo());
            }
            else if (buttonId === 'new') {
                clearForm();
				$("#sftp-upload-settings-list-menu").hide();
            }
			else if (buttonId === 'open-folder') {
				FileSystem.showOpenDialog(false, true, Strings.CHOOSE_FOLDER, dataStorage.getProjectUrl(), null, function (err, files) {
					if (!err) {
						// If length == 0, user canceled the dialog; length should never be > 1
						if (files.length > 0) {
							$btn.prev('input:text').val(files[0]);
						}
					}
				});
			}
            else {
				itensToRemove = [];
                dialog.close();
            }
        });
		
    };
});
