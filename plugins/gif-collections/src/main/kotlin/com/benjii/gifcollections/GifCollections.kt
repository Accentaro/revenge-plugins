@file:JvmName("GifCollections")

package com.benjii.gifcollections

import android.net.Uri
import io.github.revenge.bridge.asDelegate
import io.github.revenge.plugins.plugin
import io.github.revenge.xposed.api.registerNativeAsyncMethod
import java.io.ByteArrayOutputStream

@Suppress("UNUSED")
val gifCollections = plugin {
    start {
        withAppContext { context ->
            registerNativeAsyncMethod("revenge-next.gif-collections.readBackup") { args ->
                check(enabled) { "GIF Collections is disabled." }
                val value by args.asDelegate().string()
                val uri = Uri.parse(value)
                require(uri.scheme == "content") { "Choose a backup using the file picker." }
                checkNotNull(context.contentResolver.openInputStream(uri)).use { input ->
                    val output = ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    var count = input.read(buffer)
                    while (count != -1) {
                        require(output.size() + count <= 16 * 1024 * 1024) { "Backup is too large." }
                        output.write(buffer, 0, count)
                        count = input.read(buffer)
                    }
                    output.toString("UTF-8")
                }
            }
        }
    }
}
