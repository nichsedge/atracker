package com.example.atracker

data class BrowserConfig(
    val label: String,
    val urlViewIds: List<String>,
    val titleViewIds: List<String>
)

object BrowserConfigs {
    val SUPPORTED_BROWSERS = mapOf(
        "com.android.chrome" to BrowserConfig(
            label = "Chrome",
            urlViewIds = listOf(
                "com.android.chrome:id/url_bar",
                "com.android.chrome:id/search_box_text",
                "com.android.chrome:id/location_bar_status_url"
            ),
            titleViewIds = listOf(
                "com.android.chrome:id/title",
                "com.android.chrome:id/toolbar"
            )
        ),
        "com.brave.browser" to BrowserConfig(
            label = "Brave",
            urlViewIds = listOf(
                "com.brave.browser:id/url_bar",
                "com.brave.browser:id/search_box_text",
                "com.brave.browser:id/location_bar_status_url"
            ),
            titleViewIds = listOf(
                "com.brave.browser:id/title",
                "com.brave.browser:id/toolbar"
            )
        ),
        "org.mozilla.firefox" to BrowserConfig(
            label = "Firefox",
            urlViewIds = listOf(
                "org.mozilla.firefox:id/mozac_browser_toolbar_url_view",
                "org.mozilla.firefox:id/url_bar_title"
            ),
            titleViewIds = listOf(
                "org.mozilla.firefox:id/mozac_browser_toolbar_title_view"
            )
        ),
        "com.opera.browser" to BrowserConfig(
            label = "Opera",
            urlViewIds = listOf(
                "com.opera.browser:id/url_field",
                "com.opera.browser:id/url_bar"
            ),
            titleViewIds = listOf(
                "com.opera.browser:id/title"
            )
        ),
        "com.sec.android.app.sbrowser" to BrowserConfig(
            label = "Samsung Internet",
            urlViewIds = listOf(
                "com.sec.android.app.sbrowser:id/location_bar_edit_text",
                "com.sec.android.app.sbrowser:id/url_bar_text"
            ),
            titleViewIds = listOf(
                "com.sec.android.app.sbrowser:id/title_text_view"
            )
        ),
        "com.microsoft.emmx" to BrowserConfig(
            label = "Edge",
            urlViewIds = listOf(
                "com.microsoft.emmx:id/url_bar",
                "com.microsoft.emmx:id/search_box_text",
                "com.microsoft.emmx:id/location_bar_status_url"
            ),
            titleViewIds = listOf(
                "com.microsoft.emmx:id/title",
                "com.microsoft.emmx:id/toolbar"
            )
        )
    )

    fun isBrowser(packageName: String): Boolean = packageName in SUPPORTED_BROWSERS

    fun getConfig(packageName: String): BrowserConfig? = SUPPORTED_BROWSERS[packageName]
}
