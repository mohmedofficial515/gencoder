// popup.js — renders bridge status + reconnect button.

const dot = document.getElementById("dot")
const state = document.getElementById("state")
const tab = document.getElementById("tab")
const last = document.getElementById("last")
const err = document.getElementById("err")
const btn = document.getElementById("reconnect")

function fmtAge(ts) {
	if (!ts) return "—"
	const sec = Math.max(0, Math.round((Date.now() - ts) / 1000))
	if (sec < 60) return `${sec}s ago`
	if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
	return `${Math.floor(sec / 3600)}h ago`
}

function refresh() {
	chrome.storage.local.get(["bridge_status"], (out) => {
		const s = out.bridge_status || {}
		if (s.connected) {
			dot.classList.add("ok")
			dot.classList.remove("warn")
			state.textContent = "Connected to backend"
		} else {
			dot.classList.remove("ok")
			state.textContent = "Disconnected — retrying..."
		}
		tab.textContent = s.activeTabId ? `tab #${s.activeTabId}` : "no chat tab"
		if (!s.activeTabId) dot.classList.add("warn")
		last.textContent = fmtAge(s.lastMessageAt)
		err.textContent = s.lastError || "—"
	})
}

btn.addEventListener("click", () => {
	chrome.runtime.sendMessage({ type: "force_reconnect" }, () => refresh())
})

refresh()
setInterval(refresh, 1500)
