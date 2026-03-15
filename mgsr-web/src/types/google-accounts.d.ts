// Type declarations for Google Identity Services (GIS)
// https://developers.google.com/identity/oauth2/web/reference/js-reference
declare namespace google.accounts.oauth2 {
  interface TokenClient {
    requestAccessToken(overrideConfig?: { prompt?: string }): void;
  }

  interface TokenResponse {
    access_token: string;
    error?: string;
    error_description?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string; message: string }) => void;
    prompt?: string;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
}
