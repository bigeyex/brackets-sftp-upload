define( {
	// EXTENSION.
	EXTENSION_NAME: "SFTP Upload",

    // MENUS
    UPLOAD_MENU_NAME: "Enviar via SFTP",
    DOWNLOAD_MENU_NAME: "Baixar do Servidor (Apenas arquivos locais)",
	DOWNLOAD_MENU_NAME_FTP_WALK: "Baixar do Servidor (Tudo do FTP)"
	// GENERAL.
	YES:    "Sim",
	NO:     "Não",
	OK:     "Ok",
	SAVE:   "Salvar",
	CANCEL: "Cancelar",
	UPLOAD: "Enviar",
	SKIP:   "Pular",
	CLEAR: "Limpar",
	SERVER: "Servidor",
	TEST_CONNECTION: "Testar Conexão",
	VIEW_LOG: "Ver Logs",

	// TOOLBAR.
	SERVER_SETUP: "Configurar Servidor",
	UPLOAD_ALL: "Enviar Todos",
	SKIP_ALL: "Pular Todos",
	BACKUP_ALL: "Backup Todos",

	// SETTINGS DIALOG.
	SETTINGS_DIALOG_TITLE:        "Configurações SFTP",
	SETTINGS_DIALOG_TYPE:    	  "Tipo",
	SETTINGS_DIALOG_TYPE_FTP: 	  "FTP",
	SETTINGS_DIALOG_TYPE_SFTP:    "Sftp(SSH)",
	SETTINGS_DIALOG_HOST: 		  "Servidor",
	SETTINGS_DIALOG_PORT: 		  "Porta",
	SETTINGS_DIALOG_USERNAME: 	  "Nome de Usuário",
	SETTINGS_DIALOG_PASSWORD: 	  "Senha",
	SETTINGS_DIALOG_RSAMSG:       "Caminho para Chave RSA",
	SETTINGS_DIALOG_PATH: 		  "Caminho no Servidor",
	SETTINGS_DIALOG_PATH_BACKUP:  "Caminho para Backup",
	SETTINGS_DIALOG_SERVER_NAME:  "Nome",
	SETTINGS_DIALOG_SERVER_LIST:  "Servidores",
	SETTINGS_DIALOG_SERVER_DEFAULT_NAME:  "default",
	SETTINGS_DIALOG_SERVER_NEW:  "Novo",
	SETTINGS_DIALOG_SAVE_TO_APLLY: "Clique salvar para aplicar as alterações.",
	SETTINGS_DIALOG_SAVED: "Configurações salvas",

	// BACKUP DIALOG
	BACKUP_FILES_TITLE:      "SFTP - Backup de Arquivos Alterados",
	BACKUP_FILES_LOCAL_PATH:      "Salvar em",
	BACKUP_FILES_START:      "Iniciar Download",
	
	// NO SERVER SETUP DIALOG
	NO_SEVER_SETUP: "SFTP - Nenhuma configuração de servidor",
	SERVER_SETUP_NEDEED: "Por favor realize a configuração do servidor (S)FTP antes de realizar backups ou uploads.",
	NO_BACKUP_FOLDER: "No backup folder configured for this server. ",
	
	// Autenthication
	TEST_CONNECTION_STARTING: 'Iniciando autenticação...',
	TEST_CONNECTION_SUCCESS: 'Autenticação realizada com sucesso.',
	TEST_CONNECTION_FAILED: 'Autenticação falhou.',
    
    // Log Viewer
	LOG_VIEWER_TITLE: 'Log Viewer',
	LOG_VIEWER_EMPTY: 'No log to show.'
} );
