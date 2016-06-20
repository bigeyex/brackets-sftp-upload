/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window, Mustache */

define( function( require, exports ) {
    'use strict';
    
    // Get module dependencies.
    var Dialogs = brackets.getModule( 'widgets/Dialogs' ),
        FileSystem = brackets.getModule( 'filesystem/FileSystem' ),
		Mustache = brackets.getModule("thirdparty/mustache/mustache"),

        // Extension modules.
        Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        bkpDialogTemplate = require( 'text!../html/dialog-backup-files.html' ),
		msgDialogTemplate = require( 'text!../html/dialog-message.html' ),
        
        // Variables.
        dialog,
        HasPortChanged,
        getDefaultFolderName = function() {
			var d = new Date();
			return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
		};
    
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
     * Exposed method to get default day folder name
     */
	exports.getDateFolderName = getDefaultFolderName;

    /**
     * Exposed method to show message alert
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
	};

    /**
     * Exposed method to show dialog.
     */
    exports.showDialog = function(serverInfo, callback, localPath, title) {
        // Compile dialog template.
        var self = this,
			compiledTemplate;
		
		compiledTemplate= Mustache.render( bkpDialogTemplate, {
			Strings: Strings,
			info: serverInfo,
			LocalPath: localPath,
			Title: title || Strings.BACKUP_FILES_TITLE
		});
		
        // Save dialog to variable.
        dialog = Dialogs.showModalDialogUsingTemplate( compiledTemplate );
        
		var $diag =$(dialog.getElement()).on('click', 'button.open-folder', function(evt) {
			// Pop up a folder browse dialog
			var $btn = $(this);
			FileSystem.showOpenDialog(false, true, Strings.CHOOSE_FOLDER, dataStorage.getProjectUrl(), null, function (err, files) {
				if (!err) {
					// If length == 0, user canceled the dialog; length should never be > 1
					if (files.length > 0) {
						$btn.prev('input:text').val(files[0]);
					}
				}
			});
		});

        // Open dialog.
        dialog.done( function( buttonId ) {
            // Save preferences if OK button was clicked.
            if ( buttonId === 'start' ) {
				callback.call(callback, $(".input-folder", dialog.getElement()).val());
            }
        });
    };
});
