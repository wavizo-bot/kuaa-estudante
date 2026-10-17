package com.kuaa.estudante;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

// Login Google NATIVO (Play Services) para o token do Google Drive.
// O Google recusa OAuth dentro de WebView ("esse navegador ou app pode não
// ser seguro"), então o consentimento acontece na UI do próprio Google —
// mesmo fluxo do guia de migração de loopback (AuthorizationClient).
@CapacitorPlugin(name = "KuaaOauth")
public class OAuthPlugin extends Plugin {
    private static final int REQ_DRIVE_AUTH = 4821;
    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    private PluginCall driveCall;

    @PluginMethod
    public void driveToken(PluginCall call) {
        if (driveCall != null) {
            try { driveCall.reject("substituído"); } catch (Exception ignored) {}
        }
        driveCall = call;
        getActivity().runOnUiThread(() -> {
            AuthorizationRequest req = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
                .build();
            Identity.getAuthorizationClient(getActivity()).authorize(req)
                .addOnSuccessListener(result -> {
                    if (result.hasResolution()) {
                        // Primeira vez (ou escopo novo): mostra o consentimento nativo.
                        try {
                            getActivity().startIntentSenderForResult(
                                result.getPendingIntent().getIntentSender(),
                                REQ_DRIVE_AUTH, null, 0, 0, 0);
                        } catch (Exception e) {
                            PluginCall c = driveCall; driveCall = null;
                            if (c != null) c.reject("consentimento não abriu: " + e.getMessage());
                        }
                    } else {
                        deliverDriveToken(result);
                    }
                })
                .addOnFailureListener(e -> {
                    PluginCall c = driveCall; driveCall = null;
                    if (c != null) c.reject("autorização falhou: " + e.getMessage());
                });
        });
    }

    /**
     * Sai da conta no Play Services (a API nova 21.x usa Identity.getSignInClient;
     * o antigo Identity.getGoogleSignInClient foi removido). Sem isso, o próximo
     * consentimento nativo reusa a conta automaticamente.
     */
    @PluginMethod
    public void signOut(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            Identity.getSignInClient(getActivity()).signOut()
                .addOnSuccessListener(v -> call.resolve())
                .addOnFailureListener(e -> call.reject("sair falhou: " + e.getMessage()));
        });
    }

    private void deliverDriveToken(AuthorizationResult result) {
        PluginCall c = driveCall; driveCall = null;
        if (c == null) return;
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) {
            c.reject("Google não devolveu token de acesso.");
            return;
        }
        JSObject o = new JSObject();
        o.put("token", token);
        c.resolve(o);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_DRIVE_AUTH) return;
        try {
            deliverDriveToken(
                Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data));
        } catch (Exception e) {
            PluginCall c = driveCall; driveCall = null;
            if (c != null) c.reject("login cancelado ou falhou: " + e.getMessage());
        }
    }
}
