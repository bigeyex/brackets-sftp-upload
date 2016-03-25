define( function( require, exports ) {
    'use strict';
    
    // Get module dependencies.
    var Dialogs = brackets.getModule( 'widgets/Dialogs' ),
        
        // Extension modules.
        Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        dialogTemplate = require( 'text!../html/dialog-view-logs.html' ),
        
        // Variables.
        dialog;
    
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
    exports.showDialog = function(logs, clearCallback) {
        // Compile dialog template.
        var compiledTemplate = Mustache.render( dialogTemplate, {
            Strings: Strings
        }),
        logsHtml = (function() {
            var tmp = '';
            if ( logs.length == 0 ) return '<li>' + Strings.LOG_VIEWER_EMPTY + '</li>';
            for(var i=0,il=logs.length,l;i<il;i++) {
                l=logs[i];
                tmp += '<li>' + l.type + ': ' + l.text + '</li>';
            }
            return tmp;
        }());
        // Save dialog to variable.
        dialog = Dialogs.showModalDialogUsingTemplate( compiledTemplate );
        
        $("#sftpupload-log-viewer").html(logsHtml);
        
        // Open dialog.
        dialog.done( function( buttonId ) {
            // Save preferences if OK button was clicked.
            if ( buttonId === 'clear' ) {
				clearCallback.call(clearCallback);
            }
        });
    };
});