/* Admin gate diagnostic. Run: node check-admin.mjs */
import postgres from 'postgres'

process.loadEnvFile('.env.local')

console.log('SUPER_ADMIN_EMAILS =', JSON.stringify(process.env.SUPER_ADMIN_EMAILS ?? null))
console.log('ADMIN_EMAILS       =', JSON.stringify(process.env.ADMIN_EMAILS ?? null))
console.log('AUTH_MODE          =', JSON.stringify(process.env.AUTH_MODE ?? null))
console.log('')

const sql = postgres(process.env.DIRECT_URL, { connect_timeout: 15, idle_timeout: 2, max: 1 })

try {
    const rows = await sql.unsafe(
        `select email, coalesce(platform_role, '(null)') as platform_role
     from users order by email`,
    )
    console.log('ACCOUNTS IN THE DATABASE:')
    for (const r of rows) console.log('  ', r.email.padEnd(38), r.platform_role)
    process.exit(0)
} catch (e) {
    console.log('FAILED:', e.code ?? '', e.message)
    process.exit(1)
}