// Editor messages ("Saved …", "Import failed: …"). One toast at a time, shown
// in the header's middle slot. `seq` bumps on every flash so a stale timer
// can tell it was replaced and leave the newer message alone.
import { reactive } from 'vue'

export const toast = reactive({ msg: '', tone: 'info', seq: 0 })

const TONES = ['info', 'ok', 'warn', 'error']
const TOAST_MS = 3000

export function flash(msg, tone = 'info') {
  const seq = toast.seq + 1
  toast.msg = msg
  toast.tone = TONES.includes(tone) ? tone : 'info'
  toast.seq = seq
  setTimeout(() => {
    if (toast.seq === seq) toast.msg = ''
  }, TOAST_MS)
}
