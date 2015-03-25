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
        defaultFTPport  = 21;
    
    /**
     * Set each value of the preferences in dialog.
     */
    function setValues( values ) {
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
     * Exposed method to show dialog.
     */
    exports.showDialog = function() {
        // Compile dialog template.
        var serverInfo = dataStorage.get('server_info');
        if(!serverInfo){
            serverInfo = {method:'sftp', host:'', port:defaultSFTPport, username:'', rsaPath:'', password:'', serverPath:'', uploadOnSave:0};
        }
        
        var compiledTemplate = Mustache.render( settingsDialogTemplate, {
            Strings: Strings,
            info: serverInfo
        } );
        
        // Save dialog to variable.
        dialog = Dialogs.showModalDialogUsingTemplate( compiledTemplate );
        
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

        // Open dialog.
        dialog.done( function( buttonId ) {
            // Save preferences if OK button was clicked.
            if ( buttonId === 'ok' ) {
                var $dialog = dialog.getElement();
                var serverInfo = {
                    method: $('.input-method', $dialog).val(),
                    host: $('.input-host', $dialog).val(),
                    port: $('.input-port', $dialog).val(),
                    username: $('.input-username', $dialog).val(),
                    rsaPath: $('.input-rsa-path', $dialog).val(),
                    password: $('.input-password', $dialog).val(),
                    serverPath: $('.input-server-path', $dialog).val(),
                    uploadOnSave: $('.input-save', $dialog).is(':checked')
                }
                dataStorage.set('server_info', serverInfo);
            }
        });
    };
});