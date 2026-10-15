/** Everything except the sign-in screen needs a signed-in employee; `/admin` needs an administrator. */
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, checked, refresh } = useAuth()
  if (!checked.value) await refresh()

  if (to.path === '/login') {
    if (user.value) return navigateTo(safeNext(to.query.next))
    return
  }
  if (!user.value) {
    return navigateTo({ path: '/login', query: to.fullPath === '/' ? {} : { next: to.fullPath } })
  }
  if (to.path.startsWith('/admin') && user.value.role !== 'admin') return navigateTo('/')
})
