<script setup>
// The author's setup for the selected card, under "On the table" in the
// editor's Card tab. These fields feed the engine; they are not labels on the
// table, so nothing here is echoed anywhere else. Locked while a solution is
// being recorded: a line must replay against the setup it was recorded on.
import { computed, ref, watch } from "vue";
import TriggerEditor from "./TriggerEditor.vue";
import ThresholdIcon from "./ThresholdIcon.vue";
import ConfirmInline from "./ConfirmInline.vue";
import {
  state,
  ui,
  zoneOf,
  removeCard,
  toggleControl,
  toggleUnit,
  toggleAvatar,
  toggleSite,
  toggleAura,
  toggleArtifact,
  toggleMagic,
  toggleCastFromCemetery,
  toggleMonument,
  toggleLanceToken,
  setTokenTemplate,
  TOKEN_TEMPLATE_KINDS,
  TOKEN_NAMES,
  isSpell,
  isUnit,
  isOversized,
  markDamage,
  damageOf,
  isTapped,
  toggleTap,
} from "../store.js";

// Plan decision b: damage and tapped at the start position, over existing
// store functions (markDamage writes plain damage in the editor; the tapped
// set is saved as initialTapped).
const START_STATE_CONTROLS = true;

const ELEMENTS = ["air", "earth", "fire", "water"];

const card = computed(() => (ui.selected ? state.cards[ui.selected] : null));
const zone = computed(() => (ui.selected ? zoneOf(ui.selected) : null));
const inEditor = computed(() => state.mode === "editor");
const editing = computed(() => inEditor.value && !state.recording);
const inPool = computed(() => zone.value === "pool");
const onTable = computed(
  () =>
    /^(cell:\d+:(top|bot)|site:\d+|aura:\d+)$/.test(zone.value || "") ||
    (!!ui.selected && isOversized(ui.selected))
);
const spell = computed(() => !!ui.selected && isSpell(ui.selected));
const unit = computed(() => !!ui.selected && isUnit(ui.selected));

// Kind can only be set on the pool card: copies keep the kind they were
// placed with, so the chips are shown only there rather than as dead toggles.
const KINDS = [
  { key: "minion", label: "Minion", on: (c) => c.unit && !c.avatar, toggle: toggleUnit },
  { key: "avatar", label: "Avatar", on: (c) => !!c.avatar, toggle: toggleAvatar },
  { key: "site", label: "Site", on: (c) => !!c.site, toggle: toggleSite },
  { key: "aura", label: "Aura", on: (c) => !!c.aura, toggle: toggleAura },
  { key: "artifact", label: "Artifact", on: (c) => !!c.artifact, toggle: toggleArtifact },
  { key: "magic", label: "Magic", on: (c) => !!c.magic, toggle: toggleMagic },
];

function setSide(enemy) {
  if (card.value && !!card.value.enemy !== enemy) toggleControl(ui.selected);
}
function setCastFrom(cemetery) {
  if (card.value && !!card.value.castFromCemetery !== cemetery) {
    toggleCastFromCemetery(ui.selected);
  }
}

const damage = computed(() => (ui.selected ? damageOf(ui.selected) : 0));
const tapped = computed(() => !!ui.selected && isTapped(ui.selected));

// How many abilities a card has is worth showing on the button so the author
// can see at a glance which cards are already wired up.
const abilityCount = computed(() => card.value?.abilities?.length || 0);
const showAbilities = ref(false);
const confirmingRemove = ref(false);

// A new selection starts with nothing open.
watch(
  () => ui.selected,
  () => {
    showAbilities.value = false;
    confirmingRemove.value = false;
  }
);
// Recording closes the ability editor and any pending remove.
watch(
  () => state.recording,
  (rec) => {
    if (rec) {
      showAbilities.value = false;
      confirmingRemove.value = false;
    }
  }
);

// Removing takes the card out of the puzzle for good -- Undo walks back moves,
// not deletions -- so it asks first.
function doRemove() {
  confirmingRemove.value = false;
  if (ui.selected) removeCard(ui.selected);
}
</script>

<template>
  <div v-if="card && inEditor" class="card-setup">
    <p v-if="state.recording" class="lock-note" role="note">
      <span class="lock-glyph" aria-hidden="true">🔒</span>
      Setup is locked while you record. Stop recording to change sides, stats,
      costs or abilities: every line has to start from the same setup.
    </p>

    <template v-else-if="editing">
      <h3 class="grp-h">Setup</h3>

      <!-- Kind: pool card only. -->
      <div v-if="inPool" class="grp">
        <p class="sub-h" id="cs-kind">Kind</p>
        <div class="chips" role="group" aria-labelledby="cs-kind">
          <button
            v-for="k in KINDS"
            :key="k.key"
            type="button"
            class="chip"
            :aria-pressed="k.on(card) ? 'true' : 'false'"
            @click="k.toggle(ui.selected)"
          >
            <span class="chip-mark" aria-hidden="true">{{
              k.on(card) ? "✓" : ""
            }}</span>
            {{ k.label }}
          </button>
        </div>
        <p class="help">
          Copies already on the table keep the kind they were placed with.
        </p>
      </div>

      <div class="kv">
        <span id="cs-side">Side</span>
        <div class="seg" role="group" aria-labelledby="cs-side">
          <button
            type="button"
            :aria-pressed="card.enemy ? 'false' : 'true'"
            @click="setSide(false)"
          >
            Yours
          </button>
          <button
            type="button"
            class="opp"
            :aria-pressed="card.enemy ? 'true' : 'false'"
            @click="setSide(true)"
          >
            Opponent's
          </button>
        </div>

        <template v-if="unit">
          <label for="cs-power">Power</label>
          <div class="row">
            <input
              id="cs-power"
              v-model.number="card.power"
              type="number"
              class="text-input in-num"
            />
            <template v-if="!card.avatar">
              <label for="cs-defense" class="muted">Defense</label>
              <input
                id="cs-defense"
                v-model.number="card.defense"
                type="number"
                placeholder="="
                aria-describedby="cs-defense-help"
                class="text-input in-num"
              />
            </template>
          </div>
          <span v-if="!card.avatar"></span>
          <p v-if="!card.avatar" id="cs-defense-help" class="help">
            Leave Defense blank to use Power.
          </p>
        </template>

        <template v-if="spell">
          <span id="cs-cast">Cast from</span>
          <div class="seg" role="group" aria-labelledby="cs-cast">
            <button
              type="button"
              :aria-pressed="card.castFromCemetery ? 'false' : 'true'"
              @click="setCastFrom(false)"
            >
              Hand
            </button>
            <button
              type="button"
              :aria-pressed="card.castFromCemetery ? 'true' : 'false'"
              @click="setCastFrom(true)"
            >
              Hand or cemetery
            </button>
          </div>
        </template>

        <template v-if="card.artifact">
          <span id="cs-artifact">Artifact</span>
          <div class="chips" role="group" aria-labelledby="cs-artifact">
            <button
              type="button"
              class="chip"
              :aria-pressed="card.monument ? 'true' : 'false'"
              @click="toggleMonument(ui.selected)"
            >
              <span class="chip-mark" aria-hidden="true">{{
                card.monument ? "✓" : ""
              }}</span>
              Monument
            </button>
            <button
              type="button"
              class="chip"
              :aria-pressed="card.lanceToken ? 'true' : 'false'"
              @click="toggleLanceToken(ui.selected)"
            >
              <span class="chip-mark" aria-hidden="true">{{
                card.lanceToken ? "✓" : ""
              }}</span>
              Lance token
            </button>
          </div>
        </template>
      </div>
      <p v-if="card.artifact && card.monument" class="help">
        A monument can be targeted but not carried.
      </p>
      <p v-if="card.artifact && card.lanceToken" class="help">
        A lance gives +1 strike damage and first strike, and breaks when its
        carrier strikes.
      </p>

      <!-- Cost to cast: mana (spent) + elemental thresholds (required). -->
      <div v-if="spell && card.spellCost" class="grp">
        <p class="sub-h">Cost to cast</p>
        <div class="costrow">
          <label>
            <span class="muted" aria-hidden="true">◇</span>
            <span class="sr">Mana</span>
            <input
              v-model.number="card.spellCost.mana"
              type="number"
              min="0"
              class="text-input in-num"
            />
          </label>
          <label v-for="el in ELEMENTS" :key="el">
            <ThresholdIcon :element="el" aria-hidden="true" />
            <span class="sr">{{ el }} threshold</span>
            <input
              v-model.number="card.spellCost[el]"
              type="number"
              min="0"
              class="text-input in-num"
            />
          </label>
        </div>
      </div>

      <!-- What a site provides in play: mana + elemental affinity (the
           threshold spells are checked against). -->
      <div v-if="card.site && card.affinity" class="grp">
        <p class="sub-h">Provides</p>
        <div class="costrow">
          <label>
            <span class="muted" aria-hidden="true">◇</span>
            <span class="sr">Mana</span>
            <input
              v-model.number="card.manaProvided"
              type="number"
              min="0"
              class="text-input in-num"
            />
          </label>
          <label v-for="el in ELEMENTS" :key="el">
            <ThresholdIcon :element="el" aria-hidden="true" />
            <span class="sr">{{ el }} affinity</span>
            <input
              v-model.number="card.affinity[el]"
              type="number"
              min="0"
              class="text-input in-num"
            />
          </label>
        </div>
      </div>

      <!-- The start position: damage already marked, already tapped. -->
      <div v-if="START_STATE_CONTROLS && onTable" class="grp">
        <p class="sub-h">At the start</p>
        <div class="kv">
          <template v-if="unit">
            <span id="cs-dmg">Damage</span>
            <div class="step" role="group" aria-labelledby="cs-dmg">
              <button
                type="button"
                aria-label="Less damage"
                :disabled="!damage"
                @click="markDamage(ui.selected, -1)"
              >
                −
              </button>
              <output aria-live="polite">{{ damage }}</output>
              <button
                type="button"
                aria-label="More damage"
                @click="markDamage(ui.selected, 1)"
              >
                +
              </button>
            </div>
          </template>
          <span id="cs-tap">Tapped</span>
          <button
            type="button"
            class="sw"
            :class="{ on: tapped }"
            role="switch"
            :aria-checked="tapped ? 'true' : 'false'"
            aria-labelledby="cs-tap"
            @click="toggleTap(ui.selected)"
          >
            <span class="track" aria-hidden="true"></span>
            <b>{{ tapped ? "On" : "Off" }}</b>
          </button>
        </div>
      </div>

      <div class="grp">
        <p class="sub-h">Abilities</p>
        <div class="ab-row">
          <span class="muted">{{
            abilityCount === 0
              ? "No abilities yet"
              : abilityCount === 1
              ? "1 ability"
              : `${abilityCount} abilities`
          }}</span>
          <button
            type="button"
            class="btn small"
            aria-haspopup="dialog"
            @click="showAbilities = true"
          >
            Abilities ({{ abilityCount }})
          </button>
        </div>
      </div>

      <div class="grp">
        <label class="sub-h" for="cs-token">Token art</label>
        <select
          id="cs-token"
          class="text-input"
          :value="card.tokenKind || ''"
          aria-describedby="cs-token-help"
          @change="setTokenTemplate(ui.selected, $event.target.value)"
        >
          <option value="">Not used for tokens</option>
          <option v-for="k in TOKEN_TEMPLATE_KINDS" :key="k" :value="k">
            Art for {{ TOKEN_NAMES[k] }} tokens
          </option>
        </select>
        <p id="cs-token-help" class="help">
          Generated tokens of that kind use this card's art and abilities.
        </p>
      </div>

      <div class="rule" aria-hidden="true"></div>
      <ConfirmInline
        v-if="confirmingRemove"
        :message="
          inPool
            ? 'Remove this card from the pool? This can\'t be undone.'
            : 'Remove this card from the puzzle? This can\'t be undone.'
        "
        :confirm-label="inPool ? 'Remove from the pool' : 'Remove card'"
        keep-label="Keep it"
        @confirm="doRemove"
        @cancel="confirmingRemove = false"
      />
      <button
        v-else
        type="button"
        class="btn danger remove"
        @click="confirmingRemove = true"
      >
        {{ inPool ? "Remove from the pool" : "Remove card" }}
      </button>
    </template>

    <TriggerEditor
      v-if="showAbilities && editing"
      :card-id="ui.selected"
      @close="showAbilities = false"
    />
  </div>
</template>

<style scoped>
.card-setup {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  color: var(--c-text);
}
.grp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.grp-h {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}
.sub-h {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--c-muted-hi);
}
.help {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted);
}
.muted {
  color: var(--c-muted);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}
.rule {
  height: 1px;
  background: var(--c-line);
}

/* Label / control pairs. */
.kv {
  display: grid;
  grid-template-columns: max-content 1fr;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
}
.kv > span,
.kv > label {
  font-size: var(--fs-sm);
  color: var(--c-muted-hi);
}

/* Number fields: sized in em so they scale with the text. The doubled .app
   outranks WordPress themes' input[type=number] rules, like .ca-num. */
.app.app .in-num,
.in-num {
  flex: 0 0 auto;
  width: 4.2em;
  margin: 0;
  padding: 3px 4px 3px 6px;
}
.costrow {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-3);
}
.costrow label {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
}

/* Segmented control and chips: the pressed one is gold AND bold with a
   check or inset line, never colour alone. */
.seg {
  display: inline-flex;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-md);
  overflow: hidden;
  justify-self: start;
}
.seg button {
  background: var(--c-raised);
  border: 0;
  color: var(--c-muted-hi);
  font: inherit;
  font-size: var(--fs-sm);
  padding: 5px 12px;
  min-height: 28px;
  cursor: pointer;
}
.seg button + button {
  border-left: 1px solid var(--c-line-strong);
}
.seg button[aria-pressed="true"] {
  background: var(--c-gold-bg);
  color: var(--c-gold);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--c-gold);
}
.seg button.opp[aria-pressed="true"] {
  background: var(--c-opp-deep);
  color: var(--c-opp-hi);
  box-shadow: inset 0 -2px 0 var(--c-opp);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-2);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: var(--c-raised);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-pill);
  color: var(--c-muted-hi);
  font: inherit;
  font-size: var(--fs-sm);
  padding: 3px 10px;
  min-height: 26px;
  cursor: pointer;
}
.chip-mark:empty {
  display: none;
}
.chip[aria-pressed="true"] {
  background: var(--c-gold-bg);
  border-color: var(--c-gold);
  color: var(--c-gold);
  font-weight: 700;
}

/* Damage stepper. */
.step {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-md);
  overflow: hidden;
}
.step button {
  background: var(--c-raised);
  border: 0;
  color: var(--c-text);
  font: inherit;
  width: 30px;
  min-height: 28px;
  cursor: pointer;
}
.step button:disabled {
  opacity: 0.45;
  cursor: default;
}
.step output {
  min-width: 2.2em;
  text-align: center;
  font-weight: 700;
  color: var(--c-cream-hi);
}

/* Tapped switch: track + the word On/Off. */
.sw {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  justify-self: start;
  background: none;
  border: 0;
  padding: 2px 0;
  color: var(--c-muted-hi);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
}
.sw .track {
  position: relative;
  width: 32px;
  height: 18px;
  border-radius: var(--r-pill);
  border: 1px solid var(--c-line-strong);
  background: var(--c-raised);
}
.sw .track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--c-muted-2);
  transition: left 0.15s ease;
}
.sw.on .track {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
}
.sw.on .track::after {
  left: 16px;
  background: var(--c-gold);
}
.sw.on {
  color: var(--c-gold);
}

.ab-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
}
.remove {
  align-self: stretch;
}

.lock-note {
  display: flex;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted-hi);
}

.seg button:focus-visible,
.chip:focus-visible,
.step button:focus-visible,
.sw:focus-visible,
.btn:focus-visible,
.in-num:focus-visible,
select:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .sw .track::after {
    transition: none;
  }
}
</style>
