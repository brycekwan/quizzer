# Socket.IO / OkHttp keep rules if minify is enabled later.
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
