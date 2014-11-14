define( function( require, exports, module ) {
	'use strict';

	// Get dependencies.
	var extensionUtils = brackets.getModule( 'utils/ExtensionUtils' ),
		_				= brackets.getModule("thirdparty/lodash"),
		FileSystem		= brackets.getModule("filesystem/FileSystem"),
		ProjectManager	= brackets.getModule("project/ProjectManager"),
		FileUtils		= brackets.getModule("file/FileUtils");

	var dataCache = {},
		projectUrl ='',
		self = this,
		fileUri = module.uri.replace(/[^\/]*$/, '')+'../config.json';
	FileUtils.readAsText(FileSystem.getFileForPath(fileUri)).done(function(text){
		dataCache = JSON.parse(text);
	})
	.fail(function (errorCode) {
		dataCache = {};
		FileUtils.writeText(FileSystem.getFileForPath(fileUri), '{}');
	});

	$(ProjectManager).on('projectOpen', function(){
		projectUrl = ProjectManager.getProjectRoot().fullPath;
	});

	function init(callback){


	}

	function get(key){
		if(!(projectUrl in dataCache)){
			dataCache[projectUrl] = {};
		}
		if(key in dataCache[projectUrl]){
			return dataCache[projectUrl][key];
		}
		else{
			return null;
		}
	}

	function set(key, value){
		if(!(projectUrl in dataCache)){
			dataCache[projectUrl] = {};
		}
		dataCache[projectUrl][key] = value;
		_save();
	}

	function _save(){
	 //Can do blind write because createing file on-the-fly, therefore
	  //a useful hash will not be set up for the file - which causes
	 //a Brackets "Blind write attempted" error in the console
		FileUtils.writeText(FileSystem.getFileForPath(fileUri), JSON.stringify(dataCache), true);
	}

	exports.get = get;
	exports.set = set;

} );
