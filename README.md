brackets-sftp-upload
====================

SFTP/FTP upload plugin for brackets

## Features ##

* Keep track of changed files in your project
* Upload panel - you have total control over which to upload and which to skip
* Server settings for each project
* Store server settings in the brackets system preference file, not the root folder of your projects, so no worry about uploading your credentials to your git repo.
* Right click menu command in your project panel, upload any specific file or folder you want.  
* Also a good sample code to learn how brackets works with node.

## Getting Started ##

1. Open Extension Manager by clicking the building-blocky icon on the right side of Brackets;
2. Search for sftpupload;
3. Click Install;
4. Click the up-side arrow icon (on the right) to open the panel;
5. Navigate to your project, click "Server Setup" button and fill in your server info;
6. Now you can right-click on the files in your project, use Upload via SFTP to upload it to your server;
7. If you change and save a file within the project, it will show up in the bottom panel; you can click "Upload" to upload this file, "Skip" to skip a single file, or "Upload All" to upload all changed files to the server.
8. Shortcuts: 
    * (Ctrl-Alt-U / Cmd-Alt-U) to upload the current opening file;
    * (Ctrl-Shift-U / Cmd-Shift-U) to upload all changed files;
    * (Ctrl-Alt-Shift-U / Cmd-Alt-Shift-U) to open up Upload panel.
    
## Notes for translators ##

I noticed many people wish to translate this plugin - you are welcomed!

If you are comfortable with Github, you can fork this repo, create a new folder (with language code as its name) in /nls, and put another translated String.js in the folder. Otherwise you can translate String.js in any language folder (root for English) and send me the file (along with your name).

## Release Notes ##

version 1.3.11
- Added Brazilian Portuguese Translation (thanks @elvis-pereira)

version 1.3.10
- Added Estonian Translation (thanks @marioletta)

version 1.3.9
- added French Translation (thanks Antoine SARRAZIN)

version 1.3.8
- added Polish Translation (thanks @M1szelek)

version 1.3.7
- added Spanish Translation (thanks @dennistobar)

version 1.3.6
- fix: #21 uploading directories doesn't work for subdirectories (@zarnivoop).

version 1.3.5
- fix: no longer need to restart Brackets upon server connection errors.
- improved language in error feedback: using "Broken Connection / Wrong Password" for server connection errors.

version 1.3.4
- showing available languages in Bracket's Plugin Manager
- added Swedish (sv) translation (thanks @zarnivoop)

version 1.3.3
- feature: allows password protected RSA encryption keys (@swengmatt).

version 1.3.2
- bug fix: When type is changed, the port won't change to it's default if the user has already set his value

version 1.3.1
- @dedo1911 added Italian translation.
- new shortcut for "Upload All": Ctrl-Shift-U.

version 1.3
- now saves server info in local user preferences.
- added an indicator icon in the right hand side.
- Ctrl-Alt-U uploads the current file now. Open the panel via Ctrl-Alt-Shift-U.
- click "Upload on Save" button now triggers the checkbox.
- for developers: now uses 4-spaces instead of tabs across all the file.

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

## Notes for developers ##

This repo does not include required node modules! For extension developers, please run 

npm install

in the /node folder.

## Contributors ##

@bigeyex
@danielkratz
@mhentgesarrow
@dedo1911
@swengmatt
@zarnivoop
@dennistobar (Spanish Translation)
@M1szelek (Polish Translation)
Antoine SARRAZIN (French Translation)
@marioletta (Estonian Translation)
@elvis-pereira (Brazilian Portuguese Translation)