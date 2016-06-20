/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, brackets, window, Mustache */

define( function( require, exports, module ) {
    'use strict';

    // Get dependencies.
    var extensionUtils = brackets.getModule( 'utils/ExtensionUtils' ),
        _                 = brackets.getModule("thirdparty/lodash"),
        FileSystem        = brackets.getModule("filesystem/FileSystem"),
        ProjectManager = brackets.getModule( 'project/ProjectManager' ),
        FileUtils         = brackets.getModule("file/FileUtils"),
        PreferencesManager = brackets.getModule( 'preferences/PreferencesManager' ),
        preferences = PreferencesManager.getExtensionPrefs( 'bigeyex.bracketsSFTPUpload' );

    var self = this,
        propertyList = {},
        projectUrl = '';

    function init(callback){
        projectUrl = ProjectManager.getProjectRoot().fullPath;
    }

    function get(key){
        return preferences.get(projectUrl+'|'+key);
    }

    function set(key, value){
        if(!(projectUrl+'|'+key in propertyList)){
            preferences.definePreference(projectUrl+'|'+key, 'string', '');
            propertyList[projectUrl+'|'+key] = true;
        }
        preferences.set(projectUrl+'|'+key, value);
    }

    function _save(){
    }


    exports.get = get;
    exports.set = set;

	exports.setProjectUrl = function(url) {
		projectUrl = url;
	};
	exports.getProjectUrl = function() {
		return projectUrl;
	};

} );
