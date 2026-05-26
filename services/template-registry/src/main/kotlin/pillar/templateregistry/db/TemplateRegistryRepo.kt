package pillar.templateregistry.db

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.Connection

data class DarUpload(val id:String,val tenantId:String,val environment:String,val livemode:Boolean,val sha256:String)
data class PackageVersion(val id:String,val tenantId:String,val environment:String,val livemode:Boolean,val templateFamily:String,val operationType:String,val packageId:String,val packageVersion:String,val status:String,val registryVersion:Int)
class TemplateRegistryRepo(jdbcUrl:String) { private val ds=HikariDataSource(HikariConfig().apply{this.jdbcUrl=jdbcUrl}); fun <T> tx(block:(Connection)->T):T=ds.connection.use(block)
 fun listPackageVersions():List<PackageVersion> = tx { c -> c.createStatement().executeQuery("select id,tenant_id,environment,livemode,template_family,operation_type,package_id,package_version,status,registry_version from template_registry.package_versions").use { rs -> buildList { while(rs.next()) add(PackageVersion(rs.getString(1),rs.getString(2),rs.getString(3),rs.getBoolean(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8),rs.getString(9),rs.getInt(10))) } } }
}
