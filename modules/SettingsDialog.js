define( function( require, exports ) {
    'use strict';
    
    // Get module dependencies.
    var Dialogs = brackets.getModule( 'widgets/Dialogs' ),
        
        // Extension modules.
        Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        settingsDialogTemplate = require( 'text!../html/dialog-settings.html' ),
        
        // Variables.
        dialog,
        HasPortChanged,
        defaultSFTPport = 22,
        defaultFTPport  = 21,
        defaultBackUpPath = 'sftp-backups';
    
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
    }
    /**
     * Initialize dialog values.
     */
    function init() {
        $('#sftpupload-settings-dialog .input-method').change(function(){
            var protcolType = $('#sftpupload-settings-dialog .input-method').val();
            var port = $('#sftpupload-settings-dialog .input-port');
            if(protcolType == 'sftp' && port.val() == defaultFTPport && !HasPortChanged){
                port.val(defaultSFTPport);
            }
            else if(protcolType == 'ftp' && port.val() == defaultSFTPport && !HasPortChanged){
                port.val(defaultFTPport);
            }
        });
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
    exports.showDialog = function(testConnection) {
        // Compile dialog template.
        var serverInfo = dataStorage.get('server_info');
        if(!serverInfo){
            serverInfo = {method:'sftp', host:'', port:defaultSFTPport, username:'', rsaPath:'', password:'', serverPath:'', uploadOnSave:0, backupPath:defaultBackUpPath};
        }
        // For compability with previous version
        else if ( serverInfo.backupPath === undefined ) {
            serverInfo.backupPath = defaultBackUpPath;
        }
        
        var compiledTemplate = Mustache.render( settingsDialogTemplate, {
            Strings: Strings,
            info: serverInfo
        } );
        
        // Save dialog to variable.
        dialog = Dialogs.showModalDialogUsingTemplate( compiledTemplate, false );
        
        // Initialize dialog values.
        init();
        
        HasPortChanged = false;
        
        $('#sftpupload-settings-dialog .input-port').change(function(){
            HasPortChanged = true;
        });
        
        if(serverInfo.uploadOnSave){
            $('.input-save').prop('checked', true);
        }
        $('.input-method').val(serverInfo.method);

        // manually handle ESC and buttons Key because of autoDismiss = false
        $(dialog.getElement())
        .off('keyup')
        .on('keyup', function(evt) { 
            if ( evt.keyCode === 27 ) {
                dialog.close();
            }
        })
        .off('click', 'button')
        .on('click', 'button', function(evt) {
            var buttonId = $(this).data('button-id'),
                _getInfo = function() {
                    var $dialog = dialog.getElement();
                    return {
                        method: $('.input-method', $dialog).val(),
                        host: $('.input-host', $dialog).val(),
                        port: $('.input-port', $dialog).val(),
                        username: $('.input-username', $dialog).val(),
                        rsaPath: $('.input-rsa-path', $dialog).val(),
                        password: $('.input-password', $dialog).val(),
                        serverPath: $('.input-server-path', $dialog).val(),
                        uploadOnSave: $('.input-save', $dialog).is(':checked')
                    }	
                };

            if ( buttonId === 'ok' ) {
                var serverInfo = _getInfo();
                dataStorage.set('server_info', serverInfo);
                dialog.close();
            }
            else if (buttonId === 'test') {
                var serverInfo = _getInfo();
                testConnection.call(testConnection, serverInfo);
            }
            else {
                dialog.close();
            }
        });
		
    };
});