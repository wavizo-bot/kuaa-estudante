package com.kuaa.estudante;

import android.app.Dialog;
import android.net.Uri;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Janela própria para OAuth (ex.: login Google): WebView em diálogo com
// User-Agent de desktop + intercepta o redirect loopback antes de carregar.
// Não abre navegador e não precisa de servidor local no aparelho.
@CapacitorPlugin(name = "KuaaOauth")
public class OAuthPlugin extends Plugin {
    private static final String DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    private Dialog dialog;
    private WebView webView;
    private PluginCall activeCall;
    private String redirectPrefix = "http://127.0.0.1";

    @PluginMethod
    public void startOAuth(PluginCall call) {
        String url = call.getString("url");
        String prefix = call.getString("redirectPrefix");
        if (url == null || url.isEmpty()) {
            call.reject("sem url");
            return;
        }
        if (prefix != null && !prefix.isEmpty()) {
            redirectPrefix = prefix;
        }
        if (activeCall != null) {
            try { activeCall.reject("substituído"); } catch (Exception ignored) {}
        }
        activeCall = call;
        getActivity().runOnUiThread(() -> openDialog(url));
    }

    private void openDialog(String url) {
        closeDialog();
        dialog = new Dialog(getActivity());
        dialog.setTitle("kuaa — Google");
        dialog.setCancelable(true);
        dialog.setOnCancelListener(d -> finish(null, "cancelado"));
        FrameLayout root = new FrameLayout(getActivity());
        root.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView = new WebView(getActivity());
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setUserAgentString(DESKTOP_UA);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handle(request.getUrl().toString());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handle(url);
            }
            private boolean handle(String url) {
                if (url != null && url.startsWith(redirectPrefix)) {
                    Uri u = Uri.parse(url);
                    String code = u.getQueryParameter("code");
                    String err = u.getQueryParameter("error");
                    JSObject ret = new JSObject();
                    if (code != null) {
                        ret.put("code", code);
                        finish(ret, null);
                    } else {
                        finish(null, err != null ? err : "negado");
                    }
                    return true;
                }
                return false;
            }
        });
        root.addView(webView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        dialog.setContentView(root);
        try {
            dialog.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        } catch (Exception ignored) {}
        dialog.show();
        webView.loadUrl(url);
    }

    private void finish(JSObject result, String error) {
        PluginCall call = activeCall;
        activeCall = null;
        try {
            getActivity().runOnUiThread(this::closeDialog);
        } catch (Exception ignored) {}
        if (call == null) return;
        try {
            if (error != null) call.reject(error);
            else call.resolve(result != null ? result : new JSObject());
        } catch (Exception ignored) {}
    }

    private void closeDialog() {
        try {
            if (webView != null) {
                webView.stopLoading();
                webView.destroy();
            }
        } catch (Exception ignored) {}
        webView = null;
        try {
            if (dialog != null && dialog.isShowing()) dialog.dismiss();
        } catch (Exception ignored) {}
        dialog = null;
    }
}
