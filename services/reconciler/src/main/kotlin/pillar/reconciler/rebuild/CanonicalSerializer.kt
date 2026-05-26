package pillar.reconciler.rebuild
class CanonicalSerializer { fun serialize(row:Map<String,Any?>)=row.filterKeys{it !in setOf("updated_at","lease_token","run_id")}.toSortedMap().entries.joinToString(prefix="{", postfix="}"){"\"${it.key}\":\"${it.value}\""} }
