/*!
 * Brackets Todo 0.5.3
 * Display all todo comments in current document or project.
 *
 * @author Mikael Jorhult
 * @license http://mikaeljorhult.mit-license.org MIT
 */
define( function( require, exports, module ) {
	'use strict';
	
	// Get dependencies.
	var Async = brackets.getModule( 'utils/Async' ),
		Menus = brackets.getModule( 'command/Menus' ),
		CommandManager = brackets.getModule( 'command/CommandManager' ),
		Commands = brackets.getModule( 'command/Commands' ),
		PreferencesManager = brackets.getModule( 'preferences/PreferencesManager' ),
		ProjectManager = brackets.getModule( 'project/ProjectManager' ),
		EditorManager = brackets.getModule( 'editor/EditorManager' ),
		DocumentManager = brackets.getModule( 'document/DocumentManager' ),
		PanelManager = brackets.getModule( 'view/PanelManager' ),
		Resizer = brackets.getModule( 'utils/Resizer' ),
		AppInit = brackets.getModule( 'utils/AppInit' ),
		FileUtils = brackets.getModule( 'file/FileUtils' ),
		FileSystem = brackets.getModule( 'filesystem/FileSystem' ),
		ExtensionUtils = brackets.getModule( 'utils/ExtensionUtils' ),
		
		// Extension basics.
		COMMAND_ID = 'bigeyex.bracketsSFTPUpload.enable',

		Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        settingsDialog = require( 'modules/SettingsDialog' ),
		
		// Preferences.
		preferences = PreferencesManager.getExtensionPrefs( 'bigeyex.bracketsSFTPUpload' ),
		
		// Mustache templates.
		todoPanelTemplate = require( 'text!html/panel.html' ),
		todoResultsTemplate = require( 'text!html/results.html' ),
		todoRowTemplate = require( 'text!html/row.html' ),
		todoToolbarTemplate = require( 'text!html/tools.html' ),
		
		// Setup extension.
        serverInfo, //sftp username/password etc;
        changedFiles,
		$todoPanel,
		$todoIcon = $( '<a href="#" title="' + Strings.EXTENSION_NAME + '" id="brackets-sftp-upload-icon"></a>' ),
		
		// Get view menu.
		menu = Menus.getMenu( Menus.AppMenuBar.VIEW_MENU );
	
	// Define preferences.
	preferences.definePreference( 'enabled', 'boolean', false );
	
	// Register extension.
	CommandManager.register( Strings.EXTENSION_NAME, COMMAND_ID, togglePanel );
	
	// Add command to menu.
	if ( menu !== undefined ) {
		menu.addMenuDivider();
		menu.addMenuItem( COMMAND_ID, 'Ctrl-Alt-U' );
	}
	
	// Load stylesheet.
	ExtensionUtils.loadStyleSheet( module, 'todo.css' );
	
	/** 
	 * Set state of extension.
	 */
	function togglePanel() {
		var enabled = preferences.get( 'enabled' );
		
		enablePanel( !enabled );
	}
	
	/** 
	 * Initialize extension.
	 */
	function enablePanel( enabled ) {
		if ( enabled ) {
			loadSettings( function() {
				// Show panel.
				Resizer.show( $todoPanel );
			} );
			
			// Set active class on icon.
			$todoIcon.addClass( 'active' );
		} else {
			// Hide panel.
			Resizer.hide( $todoPanel );
			
			// Remove active class from icon.
			$todoIcon.removeClass( 'active' );
		}
		
		// Save enabled state.
		preferences.set( 'enabled', enabled );
		preferences.save();
		
		// Mark menu item as enabled/disabled.
		CommandManager.get( COMMAND_ID ).setChecked( enabled );
	}
	
	/**
	 * Check for settings file and load if it exists.
	 */
	function loadSettings( callback ) {
        serverInfo = dataStorage.get('server_info');
        changedFiles = dataStorage.get('changed_files');
        
        $('#btn-server-setup').click(function(){
            settingsDialog.showDialog();
        });
        
        if ( callback ) { callback(); }
	}
	
	/**
	 * Listen for save or refresh and look for todos when needed.
	 */
	function registerListeners() {
		var $documentManager = $( DocumentManager ),
			$projectManager = $( ProjectManager );
		
		// Listeners bound to Brackets modules.
		$documentManager
			.on( 'documentSaved.todo', function( event, document ) {
				//TODO: add current document to change list
			} );
		
		// Reload settings when new project is loaded.
		$projectManager.on( 'projectOpen.todo', function() {
			loadSettings( function() {
				// Reset file visibility.
			} );
		} );
	}
	
	// Register panel and setup event listeners.
	AppInit.appReady( function() {
		var panelHTML = Mustache.render( todoPanelTemplate, {
				strings: Strings
			} );
		
		// Create and cache todo panel.
		PanelManager.createBottomPanel( 'bigeyex.bracketsSFTPUpload.panel', $( panelHTML ), 100 );
		$todoPanel = $( '#brackets-sftp-upload' );
		
		// Close panel when close button is clicked.
		$todoPanel
			.on( 'click', '.close', function() {
				enablePanel( false );
			} );
		
		// Setup listeners.
		registerListeners();
		
		// Add listener for toolbar icon..
		$todoIcon.click( function() {
			CommandManager.execute( COMMAND_ID );
		} ).appendTo( '#main-toolbar .buttons' );
		
		// Enable extension if loaded last time.
		if ( preferences.get( 'enabled' ) ) {
			enablePanel( true );
		}
	} );
} );
