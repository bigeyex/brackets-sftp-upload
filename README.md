brackets-sftp-upload
====================

SFTP/FTP upload plugin for brackets

## Release Notes ##

version 1.2.4 (Thanks mhentgesarrow!)
- Conform to new API standards
- bug fix: Display saved passwords now 

version 1.2.3
- translation: added German translation (Thanks danielkratz!)

version 1.2.2
- bug fix: now can upload file with white spaces in names.

version 1.2.1
- feature: support SSH RSA private key! Just type in the path of the private key into the password field.
- bug fix: better error feedback.

version 1.2

- bug fix:  when the "upload" button fails on newly changed files;
- bug fix: setting dialog reverts to default value even when settings are changed
- feature: added new "upload on save" function


## Features ##

* Keep track of changed files in your project
* Upload panel - you have total control over which to upload and which to skip
* Server settings for each project
* Store server settings in the extension folder, not the root folder of your projects, so no worry about uploading your credentials to your git repo.
* Right click menu command in your project panel, upload any specific file or folder you want.  
* Also a good sample code to learn how brackets works with node.

## Notes for developers ##

This repo does not include required node modules! For extension develops, please run 

npm install

in the /node folder.