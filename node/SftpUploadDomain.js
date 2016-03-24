(function(){
    
    var SftpClient = require('scp2'),
        JSFtp = require("jsftp"),
        walk = require('walk'),
        nodepath = require('path'),
        fs = require('fs'),
	mkdirp = require('mkdirp'),
        _domainManager;
    
    JSFtp = require('jsftp-mkdirp')(JSFtp); 

    function SftpJobs(sftpClient){
        this.config = {
            host: '',
            username: '',
            rsaPath: '',
            password: '',
            port: '',
            serverPath: '',
            method: 'sftp',
            load: function(target){
                this.host = target.host;
                this.username = target.username;
                this.rsaPath = target.rsaPath;
                this.password = target.password;
                this.port = target.port;
                this.serverPath = target.serverPath;
                this.method = target.method;
            },
            equals: function(target){
                return (this.host == target.host && 
                   this.username == target.username &&
                   this.rsaPath == target.rsaPath &&
                   this.password == target.password &&
                   this.port == target.port &&
                   this.serverPath == target.serverPath &&
                   this.method == target.method);
            }
        };
        this.isRunning = false;
        this.jobQueue = [];
        this.sftpClient = null;
        this.ftpClient = null;
        var self = this;

        var _ftp_downloadFile = function (fullRemotePath, fullLocalPath, callback)
        {
            var local_dir = fullLocalPath.replace(/[^\/]*$/, '').replace(/\/$/, ''),
                _get_file = function() {
                    try
                    {
                        self.ftpClient.get(fullRemotePath, fullLocalPath, function(err){
                            if(err){
                                _domainManager.emitEvent("sftpUpload", "error", ['Download Error:' + err.message]);
                            }
                            else{
                                _domainManager.emitEvent("sftpUpload", "downloaded", [fullRemotePath, fullLocalPath]);
                            }
                            callback.call(callback, err);
                        });

                        _domainManager.emitEvent("sftpUpload", "downloading", [fullRemotePath, fullLocalPath]);
                    }
                    catch(err) {
                        _domainManager.emitEvent("sftpUpload", "error", ['Download Error:' + err.description]);
                        callback.call(callback, err);
                    }
                },
                _make_dir = function() {
                    mkdirp(local_dir, function (errdir) {  // creates new directory
                        if (errdir)  {
                            _domainManager.emitEvent("sftpUpload", "error", ['Create Dir Error: ' + errdir]);
                            callback.call(callback, errdir);
                        }
                        else {
                            _get_file(); 
                        }
                    });	
                };

            // Creates local diretory of backup
            try { 
                fs.stat(local_dir, function(err, dirStat) {
                    if(dirStat !== null && dirStat !== undefined && dirStat.isDirectory()) { // Directory already exists
                        _get_file();
                    }
                    else {
                        _make_dir();
                    }									 
                });
            }
            catch(err2) {
                _make_dir();
            }
        };
        self.run = function(){
            var job;
            if(job=self.jobQueue.shift()){
                self.isRunning = true;
                // if the config has changed, restart engine
                if(job.config!==null && !(self.config.equals(job.config))){
                    self.config.load(job.config);
                    if(job.config.method == 'sftp'){
                        if(self.sftpClient){
                            self.sftpClient.close();
                        }
                        self.sftpClient = null;
                    }
                    else if(job.config.method == 'ftp'){
                        if(self.ftpClient){
//                            self.ftpClient.raw.quit();
                        }
                        self.ftpClient = null;
                    }
                }

                var fullRemotePath = self._getFullRemotePath(job.remotePath),
					remotePath = job.remotePath,
                    path_only = job.localPath.replace(/[^\/]*$/, '').replace(/\/$/, '');	
				
                // do SFTP upload                
                if(self.config.method == 'sftp'){
                    if(self.sftpClient === null){
                        self.sftpClient = new SftpClient.Client();
                        var defaults = {
                            port: self.config.port,
                            host: self.config.host,
                            username: self.config.username
                        };
                        var rsa_path = self.config.rsaPath;
                        if(rsa_path.substring(0,1) == '~'){
                            var home_path = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE ;
                            rsa_path = home_path+rsa_path.substring(1);
                        }
                        if(fs.existsSync(rsa_path)){
                            defaults.privateKey =  fs.readFileSync(rsa_path);
                            defaults.passphrase = self.config.password;
                        } else {
                            defaults.password = self.config.password;
                        }
                        self.sftpClient.defaults(defaults);
                        self.sftpClient.on('error', function(err){							
                            var message = err.message;
                            if(message == 'connect ECONNREFUSED'){
                                message = 'Broken Connection / Wrong Password';
                            }
                            self.sftpClient = null;
                            self.isRunning = false;
                            self.jobQueue = [];
                            
                            if ( job.type === 'test-connection' ) {
                                _domainManager.emitEvent("sftpUpload", "connection-tested", [false, message]);
                            }
                            else {
                                _domainManager.emitEvent("sftpUpload", "error", [message]);
                            }
                        });
                    }
                    if ( job.type !== undefined && job.type === 'download' ) // Download files
                    {
                        _domainManager.emitEvent("sftpUpload", "downloading", [fullRemotePath, job.localPath]);
                        // Creates local diretory of backup
                        mkdirp(path_only, function (err) { 
                            if (err) {
                                _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                            }
                            else {
                                self.sftpClient.download(fullRemotePath, job.localPath, function(err){
                                    if(err){
                                        _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                        self.run();
                                    }
                                    else{
                                        _domainManager.emitEvent("sftpUpload", "downloaded", [fullRemotePath, job.localPath]);
                                        self.run();
                                    }
                                });
                            }
                        });
                    }
                    else if ( job.type === 'test-connection' ) {
                        self.sftpClient.testConnection(function(err, isOk) {
                            _domainManager.emitEvent("sftpUpload", "connection-tested", [isOk, ""]);
                            self.run();
                        });
                    }
                    else {
                        fs.stat(job.localPath, function(err, stats){
                            if(err){
                                _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                self.run();
                            }
                            if(stats.isFile()) {
                                _domainManager.emitEvent("sftpUpload", "uploading", [remotePath]);
                                self.sftpClient.upload(job.localPath, fullRemotePath, function(err){
                                    if(err){
                                        _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                        self.run();
                                    }
                                    else{
                                        _domainManager.emitEvent("sftpUpload", "uploaded", [remotePath]);
                                        self.run();
                                    }
                                });
                            }
                            else if(stats.isDirectory()){
                                _domainManager.emitEvent("sftpUpload", "uploading", [remotePath]);
                                self.sftpClient.mkdir(fullRemotePath, function(err){
                                    if(err){
                                        _domainManager.emitEvent("sftpUpload", "error", [err]);
                                        self.run();
                                    }
                                    else{
                                        _domainManager.emitEvent("sftpUpload", "uploaded", [remotePath]);
                                        self.run();
                                    }
                                });
                            }
                        });   // fs.stat
                    } // else method == upload
                }   
				// do FTP upload
                else if(self.config.method == 'ftp'){
                    if(self.ftpClient === null){
                        self.ftpClient = new JSFtp({
                            port: self.config.port,
                            host: self.config.host,
                            user: self.config.username,
                            pass: self.config.password
                        });
                    }
                    self.ftpClient.on('error', function(err){
                        var message = err.message;
                        if(message == 'connect ECONNREFUSED'){
                            message = 'Broken Connection / Wrong Password';
                        }
                        self.ftpClient = null;
                        self.isRunning = false;
                        self.jobQueue = [];
                        if ( job.type === 'test-connection' ) {
                            _domainManager.emitEvent("sftpUpload", "connection-tested", [false, message]);
                        }
                        else {
                            _domainManager.emitEvent("sftpUpload", "error", [message]);
                        }
                        self.run();
                    });
                    
                    if ( job.type !== undefined && job.type === 'download' ) // Download files
                    {
                        _domainManager.emitEvent("sftpUpload", "downloading", [fullRemotePath, job.localPath]);

                        _ftp_downloadFile(fullRemotePath, job.localPath, function() {
                            self.run();
                        });
                    }
                    else if ( job.type === 'test-connection' ) {
                        self.ftpClient.raw.stat(function(err, data) {
                            if ( data.code === 211 ) {  // Successfull auth
                                _domainManager.emitEvent("sftpUpload", "connection-tested", [true, data.text]);
                            }
                            else {
                                _domainManager.emitEvent("sftpUpload", "connection-tested", [false, err.message]);
                            }
                            self.run();
                        });
                    }
                    else // Do Upload
                    {
                        fs.stat(job.localPath, function(err, stats){
                            if(err){
                                _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                self.run();
                            }
                            if(stats.isFile()) {
                                _domainManager.emitEvent("sftpUpload", "uploading", [remotePath]);
                                var path_only = fullRemotePath.replace(/[^\/]*$/, '').replace(/\/$/, '');
                                self.ftpClient.mkdirp(path_only, function(err){
                                    if(err){
                                        _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                        self.run();
                                    }
                                    else{
                                        self.ftpClient.put(job.localPath, fullRemotePath, function(err){
                                            if(err){
                                                _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                                self.run();
                                            }
                                            else{
                                                _domainManager.emitEvent("sftpUpload", "uploaded", [remotePath]);
                                                self.run();
                                            }
                                        });
                                    }
                                });
                            }
                            else if(stats.isDirectory()){
                                _domainManager.emitEvent("sftpUpload", "uploading", [remotePath]);
                                self.ftpClient.raw.mkd(fullRemotePath, function(err){
                                    if(err){
                                        _domainManager.emitEvent("sftpUpload", "error", [err.message]);
                                        self.run();
                                    }
                                    else{
                                        _domainManager.emitEvent("sftpUpload", "uploaded", [remotePath]);
                                        self.run();
                                    }
                                });
                            }
                        });   // fs.stat
                    }  // else job == upload
                }   // if method == ftp
 
            }   // if there is job
            else{
                self.isRunning = false;
                _domainManager.emitEvent("sftpUpload", "jobCompleted");
                if(self.sftpClient){
                    // commented out: try to maintain a long connection for sequential uploading
//                    self.sftpClient.close();
//                    self.sftpClient = null;
                }
                if(self.ftpClient){
//                    self.ftpClient.raw.quit(function(err){
//                        console.log(err);
//                    });
//                    self.ftpClient = null;
                }
            }
        };
        		
        self.add = function(localPath, remotePath, config, jobType){
            self.jobQueue.push({localPath: localPath, remotePath: remotePath, config: config, type: jobType});
            if(!self.isRunning){
                self.run();
            }
        };
        
        self.addDirectory = function(localPath, remotePath, config){
            var walker = walk.walk(localPath, {followLinks:false, filters:[".DS_Store"]});
            walker.on("file", function(root, stats, next){
                var relativeRemotePath = nodepath.join(remotePath, root.replace(localPath, ''));
                self.add(nodepath.join(root, stats.name), nodepath.join(relativeRemotePath, stats.name), config);
                next();
            });
        };
        
        self._getFullRemotePath = function(remotePath){
            var fullRemotePath;
            if(/\/$/.test(self.config.serverPath)){   // if the user forget to add '/' in the path config, help with it.
                fullRemotePath = self.config.serverPath+remotePath;
            }
            else{
                fullRemotePath = self.config.serverPath+'/'+remotePath;
            }
            return fullRemotePath;
        };
    }
    
    var sftpJobs = new SftpJobs();
    
    function cmdUpload(localPath, remotePath, config){
        if(config === undefined) {config=null;}
        sftpJobs.add(localPath, remotePath, config);
    }

    function cmdUploadAll(filelist, config){
        if(config === undefined) {config=null;}
        for(var i in filelist){
            sftpJobs.add(filelist[i].localPath, filelist[i].remotePath, config);
        }
    }
    
    function cmdDownloadAll(filelist, config){
        if(config === undefined) {config=null;}
        for(var i in filelist){
            sftpJobs.add(filelist[i].localPath, filelist[i].remotePath, config, 'download');
        }
    }
	
	function cmdTestConnection(config) {
		if(config === undefined) {config=null;}
		sftpJobs.add('', '', config, 'test-connection');
	}
	
    function cmdUploadDirectory(localPath, remotePath, config){
        if(config === undefined) {config=null;}
        sftpJobs.addDirectory(localPath, remotePath, config);
    }

    function init(domainManager) {
        _domainManager = domainManager;
        
        if (!domainManager.hasDomain("sftpUpload")) {
            domainManager.registerDomain("sftpUpload", {major: 0, minor: 1});
        }
        
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "upload",    // command name
            cmdUpload,   // command handler function
            false,          // this command is synchronous in Node
            "Upload a single file",
            [{name: "localPath", // parameters
                type: "string",
                description: "the absolute local path of the file to be uploaded"},
             {name: "remotePath", // parameters
                type: "string",
                description: "(relative) path or filename of the destination"},
             {name: "config", // parameters
                type: "{host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backupPath: string}",
                description: "(optional) server configuration."}],
            []
        );
        
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "uploadAll",    // command name
            cmdUploadAll,   // command handler function
            false,          // this command is synchronous in Node
            "Upload a list of files in a batch",
            [{name: "filelist", // parameters
                type: "[{localPath:string, remotePath:string},...]",
                description: "a list of files to be uploaded"},
             {name: "config", // parameters
                type: "{host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backupPath: string}",
                description: "(optional) server configuration."}],
            []
        );
        
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "testConnection",    // command name
            cmdTestConnection,   // command handler function
            false,          // this command is synchronous in Node
            "Test the connection with the server setup",
            [{name: "config", // parameters
                type: "{host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backupPath: string}",
                description: "(optional) server configuration."}],
            []
        );
		
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "downloadAll",    // command name
            cmdDownloadAll,   // command handler function
            false,          // this command is synchronous in Node
            "Download a list of files in a batch",
            [{name: "filelist", // parameters
                type: "[{localPath:string, remotePath:string},...]",
                description: "a list of files to be downloaded"},
             {name: "config", // parameters
                type: "{host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backupPath: string}",
                description: "(optional) server configuration."}],
            []
        );
		
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "uploadDirectory",    // command name
            cmdUploadDirectory,   // command handler function
            false,          // this command is synchronous in Node
            "Upload a directory recursively",
            [{name: "localPath", // parameters
                type: "string",
                description: "the absolute local path of the file to be uploaded"},
             {name: "remotePath", // parameters
                type: "string",
                description: "(relative) path or filename of the destination"},
             {name: "config", // parameters
                type: "{host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backupPath: string}",
                description: "(optional) server configuration."}],
            []
        );
        
        
        domainManager.registerEvent(
            "sftpUpload",
            "uploading",
            [{
                name: "path",
                type: "string",
                description: "the absolute local path of the file being uploaded"
            }]
        );
        
        domainManager.registerEvent(
            "sftpUpload",
            "connection-tested",
            [{
                name: "ok",
                type: "bool",
                description: "true if the authentication was succesfull"
            },
            {
                name: "result",
                type: "object", // or string
                description: "Authentication result text or error object"
            }]
        );
		
        domainManager.registerEvent(
            "sftpUpload",
            "downloading",
            [{
                name: "remotePath",
                type: "string",
                description: "the absolute remote path of the file being downloaded"
            },
				{
                name: "localPath",
                type: "string",
                description: "the absolute local path of the file being uploaded"
            }]
        );
		
        domainManager.registerEvent(
            "sftpUpload",
            "uploaded",
            [{
                name: "path",
                type: "string",
                description: "the absolute local path of the file that is uploaded"
            }]
        );
        
        domainManager.registerEvent(
            "sftpUpload",
            "downloaded",
            [{
                name: "remotePath",
                type: "string",
                description: "the absolute remote path of the file being downloaded"
            },
			{
                name: "localPath",
                type: "string",
                description: "the absolute local path of the file being uploaded"
            }]
        );
		
        domainManager.registerEvent(
            "sftpUpload",
            "jobCompleted",
            []
        );
        
        domainManager.registerEvent(
            "sftpUpload",
            "error",
            [{
                name: "errorString",
                type: "string",
                description: "the description of the error"
            }]
        );
    }
    
    exports.init = init;
    
}());