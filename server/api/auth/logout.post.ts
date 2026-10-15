export default defineTerminalHandler(async (event) => {
  useAuthService().signOut(getCookie(event, SESSION_COOKIE))
  clearSessionCookie(event)
  return { ok: true }
})
