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
        WorkspaceManager = brackets.getModule( 'view/WorkspaceManager' ),
        Resizer = brackets.getModule( 'utils/Resizer' ),
        AppInit = brackets.getModule( 'utils/AppInit' ),
        FileUtils = brackets.getModule( 'file/FileUtils' ),
        FileSystem = brackets.getModule( 'filesystem/FileSystem' ),
        ExtensionUtils = brackets.getModule( 'utils/ExtensionUtils' ),
        NodeDomain = brackets.getModule("utils/NodeDomain"),

        // Extension basics.
        COMMAND_ID = 'bigeyex.bracketsSFTPUpload.enable',
        COMMAND_ID_UPLOAD = 'bigeyex.bracketsSFTPUpload.upload',
        COMMAND_ID_UPLOAD_ALL = 'bigeyex.bracketsSFTPUpload.uploadAll',

        Strings = require( 'modules/Strings' ),
        dataStorage = require( 'modules/DataStorageManager' ),
        settingsDialog = require( 'modules/SettingsDialog' ),

        // Preferences.
        preferences = PreferencesManager.getExtensionPrefs( 'bigeyex.bracketsSFTPUpload' ),

        // Mustache templates.
        todoPanelTemplate = require( 'text!html/panel.html' ),
        todoRowTemplate = require( 'text!html/row.html' ),

        // Setup extension.
        serverInfo, //sftp username/password etc;
        $todoPanel,
        projectUrl,
        $todoIcon = $( '<a href="#" title="' + Strings.EXTENSION_NAME + '" id="brackets-sftp-upload-icon"></a>' ),

        // Get view menu.
        menu = Menus.getMenu( Menus.AppMenuBar.VIEW_MENU ),
        contextMenu = Menus.getContextMenu(Menus.ContextMenuIds.PROJECT_MENU);

    // Define preferences.
    preferences.definePreference( 'enabled', 'boolean', false );

    // Get Node module domain
    var _domainPath = ExtensionUtils.getModulePath(module, "node/SftpUploadDomain");
    var _nodeDomain = new NodeDomain("sftpUpload", _domainPath);

    // Register extension.
    CommandManager.register( Strings.EXTENSION_NAME, COMMAND_ID, togglePanel );
    CommandManager.register( Strings.UPLOAD_MENU_NAME, COMMAND_ID_UPLOAD, uploadMenuAction );
    CommandManager.register( Strings.UPLOAD_ALL, COMMAND_ID_UPLOAD_ALL, uploadAllItems );


    // Add command to menu.
    if ( menu !== undefined ) {
        menu.addMenuDivider();
        menu.addMenuItem( COMMAND_ID, 'Ctrl-Alt-Shift-U' );
        menu.addMenuItem( COMMAND_ID_UPLOAD, 'Ctrl-Alt-U' );
        menu.addMenuItem( COMMAND_ID_UPLOAD_ALL, 'Ctrl-Shift-U' );
    }

    if ( contextMenu !== undefined ) {
        contextMenu.addMenuDivider();
        contextMenu.addMenuItem( COMMAND_ID_UPLOAD );
    }

    // Load stylesheet.
    ExtensionUtils.loadStyleSheet( module, 'todo.css' );

    /**
     * Set state of extension.
     */
    // this is a menu item
    function togglePanel() {
        var enabled = preferences.get( 'enabled' );

        enablePanel( !enabled );
    }

    function uploadMenuAction(){
        var item = ProjectManager.getSelectedItem();
        var projectUrl = ProjectManager.getProjectRoot().fullPath;
        var remotePath = item.fullPath.replace(projectUrl, '');
        if(item.isFile){
            uploadItem(item.fullPath, remotePath);
        }
        else{
            uploadDirectory(item.fullPath, remotePath);
        }
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
        preferences.save()

        // Mark menu item as enabled/disabled.
        CommandManager.get( COMMAND_ID ).setChecked( enabled );
    }

    // this is called every time the panel opens.
    function loadSettings( callback ) {
        var changedFiles = dataStorage.get('changed_files');
        var files = [];
        var projectUrl = ProjectManager.getProjectRoot().fullPath;
        for(var filepath in changedFiles){
            files.push({
                path: filepath,
                file: filepath.replace(projectUrl, '')
            });
        }

        $('#sftp-upload-tbody').empty().append(Mustache.render( todoRowTemplate, {
                strings: Strings,
                files: files
        } ));

        $('#sftp-upload-tbody tr').off().on('click', function(){
            var fullPath = $(this).attr('x-file');
            CommandManager.execute( Commands.FILE_OPEN, { fullPath: fullPath } );
        });

        $('#sftp-upload-tbody .upload-button').off().on('click', function(e){
            uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
            e.stopPropagation();
        });

        $('#sftp-upload-tbody .skip-button').off().on('click', function(e){
            skipItem($(this).attr('x-file'));
            e.stopPropagation();
        });

        if ( callback ) { callback(); }
    }
    
    function showUploadingIconStatus(status){
        if(status){
            $todoIcon.addClass( 'uploading' );
        }
        else{
            $todoIcon.removeClass( 'uploading' );
        }
    }

    // upload ONE file to the server
    function uploadItem(localPath, remotePath){
        var serverInfo = dataStorage.get('server_info');
        showUploadingIconStatus(true);
        _nodeDomain.exec('upload', localPath, remotePath, serverInfo).fail(function(err){
            showUploadingIconStatus(false);
            updateStatus(err);
        });
    }

    function uploadDirectory(localPath, remotePath){
        var serverInfo = dataStorage.get('server_info');
        showUploadingIconStatus(true);
        _nodeDomain.exec('uploadDirectory', localPath, remotePath, serverInfo).fail(function(err){
            showUploadingIconStatus(false);
            updateStatus(err);
        });
    }

    // upload all files in the panel to the server
    function uploadAllItems(){
        var serverInfo = dataStorage.get('server_info');
        var trs = $('#brackets-sftp-upload tr .upload-button');
        var filelist = [];
        for(var i=0;i<trs.length;i++){
            var arg = {
                localPath: $(trs[i]).attr('x-file'),
                remotePath: $(trs[i]).attr('r-file')
            };
            filelist.push(arg);
        }
        showUploadingIconStatus(true);
        _nodeDomain.exec('uploadAll', filelist, serverInfo).fail(function(err){
            showUploadingIconStatus(false);
            updateStatus(err);
        });
    }

    function skipItem(path) {
        var changedFiles = dataStorage.get('changed_files') || {};
        $('#brackets-sftp-upload tr[x-file="'+path+'"]').remove();
        if(path in changedFiles){
            delete changedFiles[path];
            dataStorage.set('changed_files', changedFiles);
        }
    }

    function skipAllItems(){
        $('#brackets-sftp-upload tr').remove();
        dataStorage.set('changed_files', {});
    }

    function updateStatus(status){
        $('#brackets-sftp-upload .status-stab').text(status);
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
                var path = document.file.fullPath;
                var changedFiles = dataStorage.get('changed_files') || {};
                if(changedFiles === null){
                    changedFiles = {};
                }
                var projectUrl = ProjectManager.getProjectRoot().fullPath;
                var serverInfo = dataStorage.get('server_info');
                if(serverInfo != null && serverInfo.uploadOnSave){
                    uploadItem(path, path.replace(projectUrl, ''));
                    return;
                }
                if(!(path in changedFiles)){
                    changedFiles[path]=1;
                    dataStorage.set('changed_files', changedFiles);
                    $('#sftp-upload-tbody').append(Mustache.render( todoRowTemplate, {
                            strings: Strings,
                            files: [{
                                path: path,
                                file: path.replace(projectUrl, '')
                            }]
                    }));

                    $('#sftp-upload-tbody .upload-button').off().on('click', function(e){
                        uploadItem($(this).attr('x-file'), $(this).attr('r-file'));
                        e.stopPropagation();
                    });

                    $('#sftp-upload-tbody .skip-button').off().on('click', function(e){
                        skipItem($(this).attr('x-file'));
                        e.stopPropagation();
                    });
                }

            } );

    }

    // Register panel and setup event listeners.
    AppInit.appReady( function() {
        var panelHTML = Mustache.render( todoPanelTemplate, {
                strings: Strings
            } );

        // Create and cache todo panel.
        WorkspaceManager.createBottomPanel( 'bigeyex.bracketsSFTPUpload.panel', $( panelHTML ), 100 );
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

        $todoPanel.on('click', '.btn-server-setup',function(){
            settingsDialog.showDialog();
        });

        $todoPanel.on('click', '.btn-upload-all',function(){
            uploadAllItems();
        });

        $todoPanel.on('click', '.btn-skip-all',function(){
            skipAllItems();
        });


        // Enable extension if loaded last time.
        if ( preferences.get( 'enabled' ) ) {
            enablePanel( true );
        }

        $(_nodeDomain).on('uploading', function(err, msg){
            updateStatus('Uploading: '+msg);
        });
        $(_nodeDomain).on('uploaded', function(err, msg){
            var projectUrl = ProjectManager.getProjectRoot().fullPath;
            skipItem(projectUrl+msg);
            updateStatus('Finished: '+msg);
        });
        $(_nodeDomain).on('error', function(err, msg){
            updateStatus('Error: '+msg);
        });
        $(_nodeDomain).on('jobCompleted', function(err, msg){
            showUploadingIconStatus(false);
        });
    } );
} );
