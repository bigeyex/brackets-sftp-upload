/*jshint node: true*/
(function(){
    
    var SftpClient = require('scp2'),
        JSFtp = require("jsftp"),
        walk = require('walk'),
        nodepath = require('path'),
        fs = require('fs'),
		mkdirp = require('mkdirp'),
        _domainManager;
    
    JSFtp = require('jsftp-mkdirp')(JSFtp); 

	// Utility function to log to console
	var clog = function(text, extra) {
		if (typeof console === 'object') {
			console.log('SFTPUploadDomain: ' + text + (
				typeof extra === 'object' ? (' => ' + JSON.stringify(extra)) :
				(typeof extra === 'string' ? (' => ' + extra) : '')
			));
		}
	};
	
	var STATUS_QUEUED = 0,
		STATUS_PROCESSING = 1,
		STATUS_COMPLETED = 2,
		STATUS_ERROR = 3,
		STATUS_CANCELED = 4,
		STATUS_PAUSED = 5;

	function SftpJob(config) {
		this.id = config.id;
		this.localPath = config.localPath;
		this.remotePath = config.remotePath;
		this.fullRemotePath = config.fullRemotePath;
		this.type = config.type;
		this.callback = config.callback;
		this.config = config.config;
		this.status = STATUS_QUEUED;
	}

	SftpJob.prototype.getEventData = function() {
		return {
			id: this.id,
			localPath: this.localPath,
			remotePath: this.remotePath,
			fullRemotePath: this.fullRemotePath,
			type: this.type
		};
	};
	SftpJob.prototype.emitEvent = function(eventName, params) {
		_domainManager.emitEvent("sftpUpload", eventName, params);
	};
	SftpJob.prototype.queued = function() {
		this.status = STATUS_QUEUED;
		this.emitEvent("queued", [this.getEventData()]);
	};
	SftpJob.prototype.pause = function() {
		this.status = STATUS_PAUSED;
		this.emitEvent("paused", [this.id]);
	};
	SftpJob.prototype.pause = function() {
		this.status = STATUS_PAUSED;
		this.emitEvent("paused", [this.id]);
	};
	SftpJob.prototype.error = function(err) {
		this.status = STATUS_ERROR;
		this.emitEvent("error", [err.message, this.id]);
	};
	SftpJob.prototype.processing = function() {
		this.status = STATUS_PROCESSING;
		this.emitEvent("processing", [this.id]);
	};
	SftpJob.prototype.completed = function() {
		this.status = STATUS_COMPLETED;
		this.emitEvent("processed", [this.id]);
	};
	SftpJob.prototype.folderListed = function(files) {
		this.status = STATUS_COMPLETED;
		this.emitEvent("listed", [this.remotePath, files]);
	};

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
		this._jobCount = 0;
		this._queueCount = 0;

        var self = this;

        var _ftp_downloadFile = function (job, fullRemotePath, fullLocalPath, callback)
        {
            var local_dir = fullLocalPath.replace(/[^\/]*$/, '').replace(/\/$/, ''),
                _get_file = function() {
                    try
                    {
                        self.ftpClient.get(fullRemotePath, fullLocalPath, function(err){
                            if(err) job.error(err);
							else job.completed();
                            callback.call(callback, err);
                        });
                        job.processing();
                    }
                    catch(err) {
                        job.error();
                        callback.call(callback, err);
                    }
                },
                _make_dir = function() {
                    mkdirp(local_dir, function (errdir) {  // creates new directory
                        if (errdir)  {
                            job.error();
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

                var fullRemotePath = job.fullRemotePath,
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
							clog('SFTP Error', err);
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
								job.error(err);
                            }
                        });
                    }
                    
					// List directory files/folders
					if (job.type !== undefined && job.type === 'list') {
						clog("SFTP Listing ", fullRemotePath);
						self.sftpClient.ls(fullRemotePath, function(err, res) {
							clog("SFTP Listed:", res);
							if ( typeof job.callback === 'function' ) {
								job.callback.call(job.callback, err, res);
							}
							else {
								job.folderListed(res);
							}
							self.run();
						});
					}
					 // Download files
                    else if ( job.type !== undefined && job.type === 'download' )
                    {
                        job.processing();
						// Creates local diretory of backup
						mkdirp(path_only, function (err) {
							if (err) job.error(err);
							else {
								self.sftpClient.download(fullRemotePath, job.localPath, function(err){
									if(err){
										job.error(err);
									}
									else{
										job.downloaded();
									}
									self.run();
								});
							}
						});
                    }
					// Test Server Connection
                    else if ( job.type === 'test-connection' ) {
						// try connection
                        self.sftpClient.sftp(function(err, sftp) {
                            var isOk = err === undefined || err === null || err === false;
                            job.emitEvent("connection-tested", [isOk, !isOk ? (err.code +' at '+ err.level ) : '' ]);
							try {
								// close if connection ok
								if (self.sftpClient !== undefined && self.sftpClient !== null ) {
									self.sftpClient.close();
								}
							}
							catch(erro) {
								clog("SFTPUploadDomain test-connection", err);
							}
							finally
							{
								self.run();	
							}
                        });
                    }
					// Upload Files
                    else {
                        fs.stat(job.localPath, function(err, stats){
                            if(err){
                                job.error(err);
                                self.run();
								return;
                            }
                            if(stats.isFile()) {
                                job.processing();
                                self.sftpClient.upload(job.localPath, fullRemotePath, function(err){
                                    if (err)	job.error(err);
                                    else		job.completed();
									self.run();
                                });
                            }
							// Upload files
                            else if(stats.isDirectory()){
                                job.processing();
                                self.sftpClient.mkdir(fullRemotePath, function(err){
                                    if (err)	job.error(err);
                                    else		job.completed();
									self.run();
                                });
                            }
                        });   // fs.stat
                    } // else method == upload
                }   
				// do FTP upload
                else if(self.config.method == 'ftp'){

					// Create FTP Client
                    if(self.ftpClient === null){
                        self.ftpClient = new JSFtp({
                            port: self.config.port,
                            host: self.config.host,
                            user: self.config.username,
                            pass: self.config.password
                        });
						// Attach error handler
						self.ftpClient.on('error', function(err){
							clog('ftp error', err);
							var message = err.message;
							if(message == 'connect ECONNREFUSED'){
								message = 'Broken Connection / Wrong Password';
							}
							self.ftpClient = null;
							self.isRunning = false;
							self.jobQueue = [];
							if ( job.type === 'test-connection' ) {
								job.emitEvent("connection-tested", [false, message]);
							}
							else {
								job.error(err);
							}
							self.run();
						});
                    }
                    
					// List directory job
					if (job.type !== undefined && job.type === 'list') {
						clog("FTP Listing ", fullRemotePath);
						self.ftpClient.ls(fullRemotePath, function(err, res) {
							if ( err ) {
								job.error(err);
							}
							else {
								clog("FTP Listed", res.length);
								if ( typeof job.callback === 'function' ) {
									clog("FTP Listed Calling Callback");
									job.callback.call(job.callback, err, res);
								}
								else {
									job.emitEvent("listed", [job.remotePath, res]);
								}
							}
							self.run();
						});
					}
					// Download job
                    else if ( job.type !== undefined && job.type === 'download' ) // Download files
                    {
                        job.processing();
                        _ftp_downloadFile(job, fullRemotePath, job.localPath, function() {
                            self.run();
                        });
                    }// end Download Files
                    else if ( job.type === 'test-connection' ) { 
                        self.ftpClient.raw.stat(function(err, data) {
							clog('ftp test-connection', {
								err: err,
								data: data
							});
                            if ( data.code === 211 ) {  // Successfull auth
                                job.emitEvent("connection-tested", [true, data.text]);
                            }
                            else {
                                job.emitEvent("connection-tested", [false, err.message]);
                            }
                            self.run();
                        });
                    }// end Test Connection
                    else // Do Upload
                    {
                        fs.stat(job.localPath, function(err, stats){
                            if(err){
                                job.error(err);
                                self.run();
								return;
                            }
                            if(stats.isFile()) {
                                job.processing();
                                var path_only = fullRemotePath.replace(/[^\/]*$/, '').replace(/\/$/, '');
                                self.ftpClient.mkdirp(path_only, function(err){
                                    if(err){
                                        job.error(err);
                                        self.run();
                                    }
                                    else{
                                        self.ftpClient.put(job.localPath, fullRemotePath, function(err){
                                            if(err){
                                        		job.error(err);
                                                self.run();
                                            }
                                            else{
                                                job.completed();
                                                self.run();
                                            }
                                        });
                                    }
                                });
                            }
                            else if(stats.isDirectory()){
                                job.processing();
                                self.ftpClient.raw.mkd(fullRemotePath, function(err){
                                    if(err){
										job.error(err);
                                        self.run();
                                    }
                                    else{
                                        job.completed(err);
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
        		
		self.list = function(remotePath, config, callback) {
			self.add('', remotePath, config, 'list', callback);
		};
		
        self.add = function(localPath, remotePath, config, jobType, callback){
			self._jobCount = self._jobCount + 1;
			remotePath = remotePath.replace(/\\/g, "/").replace(/\/+/g, "/");
			localPath = localPath.replace(/\\/g, "/").replace(/\/+/g, "/");

			var job_data = {
					id: this._jobCount,
					localPath: localPath,
					remotePath: remotePath,
					fullRemotePath: self._getFullRemotePath(remotePath),
					config: config,
					type: jobType,
					callback: typeof callback === 'function' ? callback : false
			   },
				job = new SftpJob(job_data);

            self.jobQueue.push(job);
			clog(self.isRunning + " - Add Job", job.getEventData());

			if ( job.type === "download" || job.type === "upload" ) {
				self._queueCount = self._queueCount + 1;
				job.queued();
			}

            if(!self.isRunning){
                self.run();
            }
        };
        
        self.addDirectory = function(localPath, remotePath, config){
            var walker = walk.walk(localPath, {followLinks:false, filters:[".DS_Store"]});
			
            walker.on("file", function(root, stats, next){
                var relativeRemotePath = nodepath.join(remotePath, root.replace(localPath, ''));
				if ( relativeRemotePath.indexOf('.DS_Store') > 0 ) {
					return next();
				}
                self.add(nodepath.join(root, stats.name), nodepath.join(relativeRemotePath, stats.name), config, 'upload');

				next();
            });
			walker.on('end', function() {
				self.queueingEnd();
			});
        };
        
        self.downDirectory = function(remotePath, localPath, downPath, config){
            var walker = walk.walk(localPath, {followLinks:false, filters:[".DS_Store"]}),
				files_added = 0,
				trigger_on = 1,
				tmp_count = 0;
			
            walker.on("file", function(root, stats, next){
                var relativeRemotePath = nodepath.join(remotePath, root.replace(localPath, '')),
					fullDownloadPath = nodepath.join(downPath, root.replace(localPath, '')) + '/ '+ stats.name;
				
				if ( relativeRemotePath.indexOf('.DS_Store') > 0 ) {
					return next();
				}
                self.add(fullDownloadPath, nodepath.join(relativeRemotePath, stats.name), config, 'download');
                
				/*
				files_added = files_added +1;
				tmp_count = tmp_count + 1;
				if ( tmp_count > trigger_on ) {
					_domainManager.emitEvent("sftpUpload", "queued", [files_added]);
					tmp_count = 0;
				}*/
				next();
            });
			walker.on('end', function() {
				self.queuedend();
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
			
			// Replaces any duplicated '//'
			fullRemotePath.replace(/(\/)+/g, "/");
			// Replaces any duplicated 
			var re = new RegExp("("+self.config.serverPath+")+","g");
			fullRemotePath = fullRemotePath.replace(re, self.config.serverPath); 
            return fullRemotePath;
        };

		self.queueingEnd = function() {
			_domainManager.emitEvent("sftpUpload", "queuedend", [this._queueCount]);
		}
	}
    
    var sftpJobs = new SftpJobs();
    
    function cmdUpload(localPath, remotePath, config){
        if(config === undefined) {config=null;}
		clog('Start Upload: ' + localPath);
        sftpJobs.add(localPath, remotePath, config, 'upload');
		sftpJobs.queueingEnd();
    }
	
	function cmdList(remotePath, config) {
        if(config === undefined) {config=null;}
		clog('Start Listing: ' + remotePath);
        sftpJobs.list(remotePath, config, false);
	}

    function cmdUploadAll(filelist, config){
        if(config === undefined) {config=null;}
        for(var i in filelist){
            sftpJobs.add(filelist[i].localPath, filelist[i].remotePath, config, 'upload');
        }
    }
    
    function cmdDownloadAll(filelist, config){
        if(config === undefined) {config=null;}
        for(var i in filelist){
            sftpJobs.add(filelist[i].localPath, filelist[i].remotePath, config, 'download');
        }
		sftpJobs.queuedend();
    }
	
    function cmdDownload(remotePath, localPath, walkPath, config){
        if(config === undefined) {config=null;}
		if ( ! walkPath || walkPath === null ) {
			sftpJobs.add(localPath, remotePath, config, 'download');
			sftpJobs.queueingEnd();
		}
		// Walk on local path
		else if ( typeof walkPath === 'string' ) {
			clog('Downloading Folder: ', remotePath + ' to ' + localPath);
			sftpJobs.downDirectory(remotePath, walkPath, localPath, config);
		}
		// Walk on Server Side
		else if ( walkPath === true ) {
			var num_lists = 0, num_recieved = 0;
			var list = function(path) {
				clog("FTP Walk - Listing", path);
				num_lists = num_lists + 1;
				sftpJobs.list(path, config, function(err, files) {
					files.forEach(function(file) {
						clog("FTP Walking", file);
						if ( file.type.toString() === "0" ) { // file
							var downPath = localPath + '/' + path  + '/' + file.name,
								rpath = path + "/" + file.name;
							downPath = downPath.replace(/\/+/g, "/");
							rpath = rpath.replace(/\/+/g, "/");

							sftpJobs.add(downPath, rpath , config, 'download');
						}
						else {
							list(path + "/" + file.name);
						}
					});
					num_recieved = num_recieved + 1;
					if ( num_recieved === num_lists) {
						sftpJobs.queueingEnd();
					}
				});
			};
			list(remotePath);
		}
    }

	function cmdTestConnection(config) {
		if(config === undefined) {config=null;}
		clog('Start Connection Test', config);
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
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object}",
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
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object}",
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
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object",
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
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object}",
                description: "(optional) server configuration."}],
            []
        );
		
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "download",    // command name
            cmdDownload,   // command handler function
            false,          // this command is synchronous in Node
            "Download a list of files in a batch",
            [{name: "remotePath", // parameters
                type: "string",
                description: "remote path to download"},
			 {name: "localPath", 
                type: "string",
                description: "remote path to download it to"},
			 {name: "walkPath", // parameters
                type: "object",
                description: "null/false for files, local path for walk on local" },
             {name: "config", 
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object}",
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
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object}",
                description: "(optional) server configuration."}],
            []
        );
        
        domainManager.registerCommand(
            "sftpUpload",       // domain name
            "list",    // command name
            cmdList,   // command handler function
            false,          // this command is synchronous in Node
            "List files on a directory",
            [{name: "remotePath", // parameters
                type: "string",
                description: "remote path to download"},
             {name: "config", 
                type: "{name: string, host: string, username: string, rsaPath: string, password: string, port: string, serverPath: string, method: string, backup: object}",
                description: "(optional) server configuration."}],
            []
        );
        
        domainManager.registerEvent(
            "sftpUpload",
            "listed",
            [{
                name: "path",
                type: "string",
                description: "the absolute local path of the directory listed"
            },{
                name: "files",
                type: "array",
                description: "the files of the directory listed"
            }]
        );
		
        domainManager.registerEvent(
            "sftpUpload",
            "processing",
            [{
                name: "id",
                type: "int",
                description: "job id"
            }]
        );

        domainManager.registerEvent(
            "sftpUpload",
            "processed",
            [{
                name: "id",
                type: "int",
                description: "job id"
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
            "queued",
            [{
                name: "job",
                type: "object",
                description: "object representation of the job"
            }]
        );
		
        domainManager.registerEvent(
            "sftpUpload",
            "queuedend",
            [{
                name: "num",
                type: "int",
                description: "number of files queued"
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
            },
			{
                name: "jobId",
                type: "int",
                description: "jobId"
            }]
        );
    }
    
    exports.init = init;
    
}());
