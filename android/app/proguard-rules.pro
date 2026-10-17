# Regra A2: stack traces desofuscáveis no mapping do AAB.
-keepattributes SourceFile,LineNumberTable

# Plugins Capacitor registrados no MainActivity (WebView -> JS -> plugin).
-keep class com.kuaa.estudante.** { *; }

# Capacitor: classes carregadas por reflexão a partir da config.
-keep class com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin { public *; }
