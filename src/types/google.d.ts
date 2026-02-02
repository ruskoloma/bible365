// Type definitions for Google Identity Services
declare namespace google {
    namespace accounts {
        namespace oauth2 {
            interface TokenResponse {
                access_token: string;
                expires_in: number;
                error?: string;
                error_description?: string;
            }

            interface TokenClient {
                callback: (response: TokenResponse) => void;
                requestAccessToken: () => void;
            }

            interface TokenClientConfig {
                client_id: string;
                scope: string;
                callback: (response: TokenResponse) => void;
            }

            function initTokenClient(config: TokenClientConfig): TokenClient;
        }
    }
}
