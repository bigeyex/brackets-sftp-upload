define( function( require, exports ) {
    'use strict';
    
    // Get module dependencies.
    var Dialogs = brackets.getModule( 'widgets/Dialogs' ),
        
        // Extension modules.
        Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        bkpDialogTemplate = require( 'text!../html/dialog-backup-files.html' ),
		msgDialogTemplate = require( 'text!../html/dialog-message.html' ),
        
        // Variables.
        dialog,
        HasPortChanged,
        defaultFolderName = (function(d){ return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate(); }(new Date()));
    
    /**
     * Set each value of the preferences in dialog.
     */
    function setValues( values ) {
    }
	
    
    /**
     * Initialize dialog values.
     */
    function init() {
        
    }
    /**
     * Exposed method to show dialog.
     */
	exports.showMessage = function(title, text) {
		var compiledTemplate = Mustache.render(msgDialogTemplate, {
			Strings: Strings,
			Message: {
				Title: title,
				Text: text
			}
		});
		Dialogs.showModalDialogUsingTemplate( compiledTemplate );
	}
    exports.showDialog = function(callback, localPath) {
        // Compile dialog template.
        var serverInfo = dataStorage.get('server_info'),
			self = this,
			compiledTemplate;
		
        if(!serverInfo || serverInfo.host === '' ){
			self.showMessage(Strings.NO_SERVER_SETUP, Strings.SERVER_SETUP_NEDEED);
        }
		else {
			compiledTemplate= Mustache.render( bkpDialogTemplate, {
				Strings: Strings,
				info: $.extend({ folder: defaultFolderName}, serverInfo),
				LocalPath: localPath
			});
		}
        
        // Save dialog to variable.
        dialog = Dialogs.showModalDialogUsingTemplate( compiledTemplate );
        
        // Open dialog.
        dialog.done( function( buttonId ) {
            // Save preferences if OK button was clicked.
            if ( buttonId === 'start' ) {
				callback.call(callback, $(".input-folder", dialog.getElement()).val());
            }
        });
    };
});