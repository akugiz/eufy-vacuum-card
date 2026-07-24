import assert from "node:assert/strict";

const registry = new Map();

globalThis.HTMLElement = class {
  attachShadow() {
    this.shadowRoot = {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    return this.shadowRoot;
  }

  dispatchEvent() {
    return true;
  }
};

globalThis.customElements = {
  define(name, implementation) {
    registry.set(name, implementation);
  },
  get(name) {
    return registry.get(name);
  },
};

globalThis.window = { customCards: [] };

await import("../vacuum-robot-menu-card.js");

const Card = customElements.get("vacuum-robot-menu-card");
assert.ok(Card, "vacuum card custom element is registered");
const Editor = customElements.get("vacuum-robot-menu-card-editor");
assert.ok(Editor, "custom slider editor is registered");

const card = new Card();
card.setConfig({
  entity: "vacuum.eufy_e28",
  extra_entities: ["script.full_house_clean"],
  scene_buttons: [
    {
      option: "Main (ID: 7)",
      name: "Main Floor",
      icon: "mdi:home-floor-1",
      color: "#ff8800",
    },
  ],
});

const states = {
  "vacuum.eufy_e28": {
    state: "docked",
    attributes: {
      friendly_name: "Eufy E28",
      battery_level: 100,
      fan_speed: "max",
      fan_speed_list: ["quiet", "normal", "max"],
    },
  },
  "sensor.eufy_e28_water_level": {
    state: "87",
    attributes: { friendly_name: "Eufy E28 Water Level", unit_of_measurement: "%" },
  },
  "sensor.eufy_e28_dock_status": {
    state: "idle",
    attributes: { friendly_name: "Eufy E28 Dock Status" },
  },
  "sensor.eufy_e28_active_cleaning_target": {
    state: "Kitchen",
    attributes: { friendly_name: "Eufy E28 Active Cleaning Target" },
  },
  "sensor.eufy_e28_cleaning_area": {
    state: "24.6",
    attributes: { friendly_name: "Eufy E28 Cleaning Area", unit_of_measurement: "m²" },
  },
  "sensor.eufy_e28_total_cleaning_time": {
    state: "1518",
    attributes: { friendly_name: "Eufy E28 Total Cleaning Time", unit_of_measurement: "min" },
  },
  "sensor.eufy_e28_wifi_signal_strength": {
    state: "-76",
    attributes: { friendly_name: "Eufy E28 WiFi Signal Strength", unit_of_measurement: "dBm" },
  },
  "image.eufy_e28_map": {
    state: "2026-07-22T18:00:00+00:00",
    attributes: { friendly_name: "Eufy E28 Map", entity_picture: "/api/image_proxy/image.eufy_e28_map" },
  },
  "select.eufy_e28_suction_level": {
    state: "max",
    attributes: { friendly_name: "Eufy E28 Suction Level", options: ["quiet", "normal", "max"] },
  },
  "select.eufy_e28_cleaning_mode": {
    state: "vacuum_and_mop",
    attributes: {
      friendly_name: "Eufy E28 Cleaning Mode",
      options: ["vacuum", "vacuum_and_mop"],
    },
  },
  "select.eufy_e28_scene_task": {
    state: "None",
    attributes: {
      friendly_name: "Eufy E28 Scene/Task",
      options: ["None", "Main (ID: 7)", "Main 2 (ID: 8)"],
    },
  },
  "switch.eufy_e28_child_lock": {
    state: "off",
    attributes: { friendly_name: "Eufy E28 Child Lock" },
  },
  "button.eufy_e28_empty_dust_bin": {
    state: "2026-07-22T12:00:00+00:00",
    attributes: { friendly_name: "Eufy E28 Empty Dust Bin" },
  },
  "button.eufy_e28_start_cleaning": {
    state: "unknown",
    attributes: { friendly_name: "Eufy E28 Start Cleaning" },
  },
  "button.eufy_e28_reset_filter": {
    state: "unknown",
    attributes: { friendly_name: "Eufy E28 Reset Filter" },
  },
  "script.full_house_clean": {
    state: "off",
    attributes: { friendly_name: "Full House Clean Max" },
  },
  "sensor.unrelated_temperature": {
    state: "21",
    attributes: { friendly_name: "Unrelated Temperature", unit_of_measurement: "°C" },
  },
};

card._hass = {
  states,
  locale: { language: "en-IE" },
  entities: {},
  callService: async () => {},
};

const deviceEntities = Object.keys(states).filter(
  (id) => id !== "script.full_house_clean" && id !== "sensor.unrelated_temperature",
);
card._registry = new Map([
  ["vacuum.eufy_e28", { entity_id: "vacuum.eufy_e28", device_id: "eufy-e28-device" }],
  ...deviceEntities
    .filter((id) => id !== "vacuum.eufy_e28")
    .map((id) => [id, { entity_id: id, device_id: "eufy-e28-device" }]),
]);
card._entities = card._discoverEntities();

assert.ok(card._entities.some((item) => item.id === "sensor.eufy_e28_water_level"));
assert.ok(card._entities.some((item) => item.id === "script.full_house_clean"));
assert.ok(!card._entities.some((item) => item.id === "sensor.unrelated_temperature"));
assert.equal(card._mapEntity()?.id, "image.eufy_e28_map");
assert.equal(card._battery(), "100%");
assert.equal(card._waterLevel(), "87%");
assert.equal(card._dockStatus(), "Idle");

card._selectedTab = "overview";
card._render();
assert.match(card.shadowRoot.innerHTML, /Eufy E28/);
assert.match(card.shadowRoot.innerHTML, /Docked/);
assert.match(card.shadowRoot.innerHTML, /87%/);
assert.match(card.shadowRoot.innerHTML, /data-vacuum-action="start"/);
assert.match(card.shadowRoot.innerHTML, /Overview/);
assert.match(card.shadowRoot.innerHTML, /Controls/);
assert.match(card.shadowRoot.innerHTML, /Configuration/);
assert.match(card.shadowRoot.innerHTML, /Diagnostics/);
assert.match(card.shadowRoot.innerHTML, /image\.eufy_e28_map/);
assert.match(card.shadowRoot.innerHTML, /Suction level/);
assert.match(card.shadowRoot.innerHTML, /info-grid list/);
assert.match(card.shadowRoot.innerHTML, /Main Floor/);
assert.match(card.shadowRoot.innerHTML, /mdi:home-floor-1/);
assert.match(card.shadowRoot.innerHTML, /--scene-button-color:#ff8800/);
card._config.hidden_overview_entities.push("__vacuum_suction_overview__");
card._render();
assert.doesNotMatch(card.shadowRoot.innerHTML, /Suction level/);
card._config.hidden_overview_entities = card._config.hidden_overview_entities.filter(
  (entityId) => entityId !== "__vacuum_suction_overview__",
);
card._config.overview_info_layout = "grid";
card._render();
assert.match(card.shadowRoot.innerHTML, /info-grid grid/);
card._config.overview_info_layout = "list";

states["vacuum.eufy_e28"].state = "cleaning";
card._render();
assert.match(card.shadowRoot.innerHTML, /Cleaning \(Kitchen\)/);
states["sensor.eufy_e28_active_cleaning_target"].state = "None";
card._render();
assert.match(card.shadowRoot.innerHTML, />\s*Cleaning\s*<\/div>/);
assert.doesNotMatch(card.shadowRoot.innerHTML, /Cleaning \(None\)/);
states["vacuum.eufy_e28"].state = "docked";
states["sensor.eufy_e28_active_cleaning_target"].state = "Kitchen";

const sceneCalls = [];
card._hass.callService = async (domain, service, data) => {
  sceneCalls.push({ domain, service, data });
};
await card._runSceneButton(0);
assert.deepEqual(sceneCalls, [
  {
    domain: "select",
    service: "select_option",
    data: { entity_id: "select.eufy_e28_scene_task", option: "Main (ID: 7)" },
  },
  {
    domain: "button",
    service: "press",
    data: { entity_id: "button.eufy_e28_start_cleaning" },
  },
]);

card._selectedTab = "controls";
card._render();
assert.match(card.shadowRoot.innerHTML, /Suction level/);
assert.match(card.shadowRoot.innerHTML, /Empty Dust Bin/);
assert.match(card.shadowRoot.innerHTML, /Full House Clean Max/);
card._config.hidden_controls_entities.push("__vacuum_suction_controls__");
card._render();
assert.doesNotMatch(card.shadowRoot.innerHTML, /Suction level/);
card._config.hidden_controls_entities = card._config.hidden_controls_entities.filter(
  (entityId) => entityId !== "__vacuum_suction_controls__",
);

card._selectedTab = "configuration";
card._render();
assert.match(card.shadowRoot.innerHTML, /Child Lock/);
assert.match(card.shadowRoot.innerHTML, /Cleaning Mode/);
assert.match(card.shadowRoot.innerHTML, /Reset Filter/);
const resetFilter = card._entities.find((item) => item.id === "button.eufy_e28_reset_filter");
const resetFilterHtml = card._renderEntityControl(resetFilter);
assert.match(resetFilterHtml, /Press/);
assert.doesNotMatch(resetFilterHtml, /Unknown/);

card._selectedTab = "diagnostics";
card._render();
assert.match(card.shadowRoot.innerHTML, /Cleaning Area/);
assert.match(card.shadowRoot.innerHTML, /WiFi Signal Strength/);

const configForm = Card.getConfigForm();
assert.ok(configForm.schema.some((item) => item.name === "entity"));
assert.ok(configForm.schema.some((item) => item.name === "extra_entities"));
for (const section of ["overview", "controls", "configuration", "diagnostics"]) {
  const expandable = configForm.schema.find((item) => item.name === `${section}_entity_settings`);
  assert.ok(expandable, `${section} has a separate entity settings section`);
  assert.ok(expandable.schema.some((item) => item.name === `${section}_entity_mode`));
  assert.ok(expandable.schema.some((item) => item.name === `${section}_entities`));
}

card.setConfig({
  entity: "vacuum.eufy_e28",
  overview_entity_mode: "selected",
  overview_entities: ["sensor.eufy_e28_cleaning_area"],
  controls_entity_mode: "selected",
  controls_entities: ["script.full_house_clean"],
  configuration_entity_mode: "selected",
  configuration_entities: ["switch.eufy_e28_child_lock"],
  diagnostics_entity_mode: "selected",
  diagnostics_entities: ["sensor.eufy_e28_wifi_signal_strength"],
});
card._entities = card._discoverEntities();
assert.deepEqual(
  card._entitiesForSection("controls", (item) => card._category(item) === "controls").map((item) => item.id),
  ["script.full_house_clean"],
);
card._selectedTab = "controls";
card._render();
assert.match(card.shadowRoot.innerHTML, /Full House Clean Max/);
assert.doesNotMatch(card.shadowRoot.innerHTML, /Empty Dust Bin/);
card._selectedTab = "configuration";
card._render();
assert.match(card.shadowRoot.innerHTML, /Child Lock/);
assert.doesNotMatch(card.shadowRoot.innerHTML, /Cleaning Mode/);
card._selectedTab = "diagnostics";
card._render();
assert.match(card.shadowRoot.innerHTML, /WiFi Signal Strength/);
assert.doesNotMatch(card.shadowRoot.innerHTML, /Cleaning Area/);

const editor = new Editor();
editor._hass = card._hass;
editor._registry = card._registry;
editor.setConfig({
  entity: "vacuum.eufy_e28",
  scene_buttons: [
    { option: "Main (ID: 7)", name: "Main Floor", icon: "mdi:home-floor-1", color: "#ff8800" },
  ],
});
editor._activeSection = "controls";
editor._render();
assert.match(editor.shadowRoot.innerHTML, /Entity visibility/);
assert.match(editor.shadowRoot.innerHTML, /Scene quick buttons/);
assert.match(editor.shadowRoot.innerHTML, /Add scene button/);
assert.match(editor.shadowRoot.innerHTML, /Main \(ID: 7\)/);
assert.match(editor.shadowRoot.innerHTML, /data-entity-visibility="button\.eufy_e28_empty_dust_bin"/);
assert.match(editor.shadowRoot.innerHTML, /data-entity-visibility="__vacuum_suction_controls__"/);
assert.match(editor.shadowRoot.innerHTML, /class="switch"/);
assert.match(editor.shadowRoot.innerHTML, /container-type: inline-size/);
assert.match(editor.shadowRoot.innerHTML, /overflow-x: hidden/);
assert.ok(
  editor.shadowRoot.innerHTML.indexOf('class="editor-section scene-editor"') <
    editor.shadowRoot.innerHTML.indexOf('class="editor-section display-editor"'),
  "Scene quick buttons are structurally rendered above Display",
);
const visibilityRow = editor.shadowRoot.innerHTML.match(/<div class="entity-toggle-row"[^>]*>[\s\S]*?<\/div>/)?.[0];
assert.ok(visibilityRow, "an entity visibility row is rendered");
assert.ok(
  visibilityRow.indexOf('class="switch"') < visibilityRow.indexOf("<ha-icon"),
  "the visibility slider is placed at the left of the entity row",
);
editor._toggleEntity("controls", "button.eufy_e28_empty_dust_bin", false);
assert.ok(editor._config.hidden_controls_entities.includes("button.eufy_e28_empty_dust_bin"));

editor._config.controls_entity_mode = "selected";
editor._config.controls_entities = [
  "button.eufy_e28_empty_dust_bin",
  "select.eufy_e28_suction_level",
  "script.full_house_clean",
];
editor._render();
assert.match(editor.shadowRoot.innerHTML, /data-drag-entity="button\.eufy_e28_empty_dust_bin"/);
assert.match(editor.shadowRoot.innerHTML, /mdi:drag-vertical/);
editor._moveEntityTo("controls", "script.full_house_clean", "button.eufy_e28_empty_dust_bin");
assert.deepEqual(editor._config.controls_entities, [
  "script.full_house_clean",
  "button.eufy_e28_empty_dust_bin",
  "select.eufy_e28_suction_level",
]);
card.setConfig(editor._config);
card._entities = card._discoverEntities();
assert.deepEqual(
  card._entitiesForSection("controls", (item) => card._category(item) === "controls").map((item) => item.id),
  ["script.full_house_clean", "button.eufy_e28_empty_dust_bin", "select.eufy_e28_suction_level"],
  "selected mode preserves the entity order chosen in the editor",
);

editor._config.controls_entity_mode = "automatic";
editor._activeSection = "controls";
editor._render();
assert.match(editor.shadowRoot.innerHTML, /data-drag-entity="select\.eufy_e28_suction_level"/);
editor._moveEntityTo("controls", "select.eufy_e28_suction_level", "script.full_house_clean");
assert.ok(
  editor._config.controls_entity_order.indexOf("select.eufy_e28_suction_level") <
    editor._config.controls_entity_order.indexOf("script.full_house_clean"),
  "automatic discovery stores drag order separately from visibility",
);

card.setConfig(editor._config);
card._entities = card._discoverEntities();
const automaticControlIds = card
  ._entitiesForSection("controls", (item) => card._category(item) === "controls")
  .map((item) => item.id);
assert.ok(
  automaticControlIds.indexOf("select.eufy_e28_suction_level") <
    automaticControlIds.indexOf("script.full_house_clean"),
  "automatic discovery follows the saved drag order on the dashboard",
);
card._selectedTab = "controls";
card._render();
assert.doesNotMatch(card.shadowRoot.innerHTML, /Empty Dust Bin/);

let serviceCall;
card._hass.callService = async (domain, service, data) => {
  serviceCall = { domain, service, data };
};
await card._callVacuum("start");
assert.deepEqual(serviceCall, {
  domain: "vacuum",
  service: "start",
  data: { entity_id: "vacuum.eufy_e28" },
});

const originalQuerySelector = card.shadowRoot.querySelector;
const oldPanel = { scrollTop: 286 };
card._renderedTab = "configuration";
card.shadowRoot.querySelector = (selector) => (selector === ".tab-panel" ? oldPanel : null);
card._capturePanelScroll();
assert.equal(card._tabScrollPositions.get("configuration"), 286);

const rebuiltPanel = { scrollTop: 0 };
card._selectedTab = "configuration";
card.shadowRoot.querySelector = (selector) => (selector === ".tab-panel" ? rebuiltPanel : null);
card._restorePanelScroll();
assert.equal(rebuiltPanel.scrollTop, 286, "tab scroll position survives a card refresh");
card.shadowRoot.querySelector = originalQuerySelector;

assert.equal(window.customCards[0].type, "vacuum-robot-menu-card");

console.log("All Eufy Vacuum Card tests passed.");
