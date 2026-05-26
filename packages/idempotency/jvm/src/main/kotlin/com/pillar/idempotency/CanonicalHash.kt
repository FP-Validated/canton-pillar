package com.pillar.idempotency

import java.security.MessageDigest

object CanonicalHash {
  fun sha256(payload: String): String = MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }
}
