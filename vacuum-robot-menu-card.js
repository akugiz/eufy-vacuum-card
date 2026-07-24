/*
 * Eufy Vacuum Card for Home Assistant
 * Version 1.7.0
 *
 * A dependency-free Lovelace card that combines a vacuum's status, controls,
 * configuration entities, map, sensors, and diagnostics into one tabbed card.
 */

const CARD_VERSION = "1.7.0";

const DEFAULTS = Object.freeze({
  title: "",
  map_entity: "",
  extra_entities: [],
  show_scene_buttons: true,
  scene_entity: "",
  scene_start_entity: "",
  scene_buttons: [],
  overview_entity_mode: "automatic",
  overview_entities: [],
  overview_entity_order: [],
  hidden_overview_entities: [],
  controls_entity_mode: "automatic",
  controls_entities: [],
  controls_entity_order: [],
  hidden_controls_entities: [],
  configuration_entity_mode: "automatic",
  configuration_entities: [],
  configuration_entity_order: [],
  hidden_configuration_entities: [],
  diagnostics_entity_mode: "automatic",
  diagnostics_entities: [],
  diagnostics_entity_order: [],
  hidden_diagnostics_entities: [],
  initial_tab: "overview",
  overview_info_layout: "list",
  show_map: true,
  show_quick_controls: true,
  show_overview: true,
  show_controls: true,
  show_configuration: true,
  show_diagnostics: true,
});

const SUPPORTED_DOMAINS = new Set([
  "automation",
  "binary_sensor",
  "button",
  "camera",
  "image",
  "input_boolean",
  "input_number",
  "input_select",
  "number",
  "scene",
  "script",
  "select",
  "sensor",
  "switch",
  "time",
]);

const ICONS = Object.freeze({
  battery: "mdi:battery",
  water: "mdi:water-percent",
  dock: "mdi:robot-vacuum-variant",
  area: "mdi:floor-plan",
  time: "mdi:clock-outline",
  map: "mdi:map-outline",
  wifi: "mdi:wifi",
  filter: "mdi:air-filter",
  brush: "mdi:brush",
  mop: "mdi:water",
  suction: "mdi:fan",
  lock: "mdi:lock-outline",
  reset: "mdi:restart",
  clean: "mdi:robot-vacuum",
  settings: "mdi:cog-outline",
  diagnostic: "mdi:chart-box-outline",
});

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function domainOf(entityId) {
  return String(entityId || "").split(".")[0];
}

function applyEntityOrder(items, order) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = (Array.isArray(order) ? order : []).map((entityId) => byId.get(entityId)).filter(Boolean);
  const orderedIds = new Set(ordered.map((item) => item.id));
  return [...ordered, ...items.filter((item) => !orderedIds.has(item.id))];
}

function suctionVisibilityId(section) {
  return `__vacuum_suction_${section}__`;
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeMdiIcon(value, fallback = "mdi:play-circle-outline") {
  const icon = String(value || "").trim();
  return /^mdi:[a-z0-9-]+$/i.test(icon) ? icon : fallback;
}

function safeColor(value, fallback = "#b58cff") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

class VacuumRobotMenuCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._registry = new Map();
    this._registryRequested = false;
    this._entities = [];
    this._selectedTab = "overview";
    this._actionError = "";
    this._tabScrollPositions = new Map();
    this._renderedTab = null;
    this._scrollingUntil = 0;
    this._deferredRenderTimer = null;
    this._scrollRestoreGeneration = 0;
    this._restorePendingUntil = 0;
  }

  static async getConfigElement() {
    return document.createElement("vacuum-robot-menu-card-editor");
  }

  static getConfigForm() {
    const entityModeSelector = {
      select: {
        mode: "dropdown",
        options: [
          { value: "automatic", label: "Automatic discovery" },
          { value: "selected", label: "Selected entities only" },
        ],
      },
    };
    const entitySection = (section, title) => ({
      type: "expandable",
      name: `${section}_entity_settings`,
      title,
      flatten: true,
      schema: [
        { name: `${section}_entity_mode`, selector: entityModeSelector },
        { name: `${section}_entities`, selector: { entity: { multiple: true } } },
      ],
    });
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: { filter: [{ domain: "vacuum" }] } },
        },
        { name: "title", selector: { text: {} } },
        {
          name: "map_entity",
          selector: {
            entity: { filter: [{ domain: "camera" }, { domain: "image" }] },
          },
        },
        {
          name: "extra_entities",
          selector: { entity: { multiple: true } },
        },
        entitySection("overview", "Overview entities"),
        entitySection("controls", "Controls entities"),
        entitySection("configuration", "Configuration entities"),
        entitySection("diagnostics", "Diagnostics entities"),
        {
          type: "expandable",
          name: "display_settings",
          title: "Display settings",
          flatten: true,
          schema: [
            {
              name: "initial_tab",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "overview", label: "Overview" },
                    { value: "controls", label: "Controls" },
                    { value: "configuration", label: "Configuration" },
                    { value: "diagnostics", label: "Diagnostics" },
                  ],
                },
              },
            },
            {
              name: "overview_info_layout",
              selector: {
                select: {
                  mode: "dropdown",
                  options: [
                    { value: "list", label: "List" },
                    { value: "grid", label: "Grid" },
                  ],
                },
              },
            },
            { name: "show_map", selector: { boolean: {} } },
            { name: "show_quick_controls", selector: { boolean: {} } },
            { name: "show_overview", selector: { boolean: {} } },
            { name: "show_controls", selector: { boolean: {} } },
            { name: "show_configuration", selector: { boolean: {} } },
            { name: "show_diagnostics", selector: { boolean: {} } },
          ],
        },
      ],
      computeLabel: (schema) => {
        const labels = {
          entity: "Vacuum robot",
          title: "Card title",
          map_entity: "Map entity (optional)",
          extra_entities: "Extra scripts, scenes or controls",
          overview_entity_mode: "Overview entity selection",
          overview_entities: "Entities shown in Overview",
          controls_entity_mode: "Controls entity selection",
          controls_entities: "Entities shown in Controls",
          configuration_entity_mode: "Configuration entity selection",
          configuration_entities: "Entities shown in Configuration",
          diagnostics_entity_mode: "Diagnostics entity selection",
          diagnostics_entities: "Entities shown in Diagnostics",
          initial_tab: "Default tab",
          overview_info_layout: "Vacuum information layout",
          show_map: "Show map",
          show_quick_controls: "Show quick controls",
          show_overview: "Show Overview tab",
          show_controls: "Show Controls tab",
          show_configuration: "Show Configuration tab",
          show_diagnostics: "Show Diagnostics tab",
        };
        return labels[schema.name];
      },
      computeHelper: (schema) => {
        if (schema.name === "entity") {
          return "Entities belonging to the same device are discovered automatically.";
        }
        if (schema.name === "map_entity") {
          return "Leave empty to automatically find a camera or image entity containing ‘map’.";
        }
        if (schema.name === "extra_entities") {
          return "Optional scripts or scenes such as Full House Clean or Clean After Cooking.";
        }
        if (schema.name.endsWith("_entity_mode")) {
          return "Automatic groups compatible device entities. Selected entities only uses the list below.";
        }
        if (schema.name.endsWith("_entities")) {
          return "Choose exactly which entities should appear in this tab when Selected entities only is active.";
        }
        return undefined;
      },
    };
  }

  static getStubConfig(hass) {
    const vacuum = Object.keys(hass?.states || {}).find((id) => id.startsWith("vacuum."));
    return { ...DEFAULTS, entity: vacuum || "vacuum.eufy_e28" };
  }

  setConfig(config) {
    if (!config?.entity) throw new Error("Select a vacuum robot entity");
    const previousEntity = this._config?.entity;
    this._config = {
      ...DEFAULTS,
      ...config,
      extra_entities: Array.isArray(config.extra_entities) ? config.extra_entities : [],
      scene_buttons: Array.isArray(config.scene_buttons)
        ? config.scene_buttons.map((button) => ({ ...button }))
        : [],
      overview_entities: Array.isArray(config.overview_entities) ? config.overview_entities : [],
      overview_entity_order: Array.isArray(config.overview_entity_order) ? config.overview_entity_order : [],
      hidden_overview_entities: Array.isArray(config.hidden_overview_entities)
        ? config.hidden_overview_entities
        : [],
      controls_entities: Array.isArray(config.controls_entities) ? config.controls_entities : [],
      controls_entity_order: Array.isArray(config.controls_entity_order) ? config.controls_entity_order : [],
      hidden_controls_entities: Array.isArray(config.hidden_controls_entities)
        ? config.hidden_controls_entities
        : [],
      configuration_entities: Array.isArray(config.configuration_entities)
        ? config.configuration_entities
        : [],
      configuration_entity_order: Array.isArray(config.configuration_entity_order)
        ? config.configuration_entity_order
        : [],
      hidden_configuration_entities: Array.isArray(config.hidden_configuration_entities)
        ? config.hidden_configuration_entities
        : [],
      diagnostics_entities: Array.isArray(config.diagnostics_entities)
        ? config.diagnostics_entities
        : [],
      diagnostics_entity_order: Array.isArray(config.diagnostics_entity_order)
        ? config.diagnostics_entity_order
        : [],
      hidden_diagnostics_entities: Array.isArray(config.hidden_diagnostics_entities)
        ? config.hidden_diagnostics_entities
        : [],
    };
    if (!previousEntity || previousEntity !== this._config.entity) {
      this._selectedTab = this._config.initial_tab || "overview";
      this._actionError = "";
      this._tabScrollPositions.clear();
      this._renderedTab = null;
      this._scrollRestoreGeneration += 1;
    }
    this._ensureValidTab();
    this._entities = this._discoverEntities();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._requestRegistry();
    this._entities = this._discoverEntities();
    this._ensureValidTab();
    this._renderOrDefer();
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { rows: 8, columns: 12, min_rows: 5, min_columns: 6 };
  }

  async _requestRegistry() {
    if (this._registryRequested || !this._hass?.callWS) return;
    this._registryRequested = true;
    try {
      const entries = await this._hass.callWS({ type: "config/entity_registry/list" });
      this._registry = new Map((entries || []).map((entry) => [entry.entity_id, entry]));
      this._entities = this._discoverEntities();
      this._renderOrDefer();
    } catch (error) {
      console.debug("Eufy Vacuum Card: entity registry unavailable", error);
    }
  }

  _registryEntry(entityId) {
    return this._registry.get(entityId) || this._hass?.entities?.[entityId] || null;
  }

  _vacuumState() {
    return this._hass?.states?.[this._config?.entity] || null;
  }

  _robotName() {
    const state = this._vacuumState();
    return this._config?.title || state?.attributes?.friendly_name || titleCase(this._config?.entity?.split(".")[1]) || "Vacuum";
  }

  _shortLabel(entityId, stateObj) {
    const registry = this._registryEntry(entityId);
    let label =
      stateObj?.attributes?.friendly_name ||
      registry?.name ||
      registry?.original_name ||
      titleCase(entityId.split(".")[1]);
    const robotName = this._robotName();
    if (label.toLowerCase().startsWith(`${robotName.toLowerCase()} `)) {
      label = label.slice(robotName.length + 1);
    }
    return label;
  }

  _discoverEntities() {
    if (!this._hass || !this._config) return [];
    const selected = this._config.entity;
    const base = selected.split(".")[1]?.toLowerCase() || "";
    const robotName = this._robotName().toLowerCase();
    const deviceId = this._registryEntry(selected)?.device_id;
    const extras = new Set(this._config.extra_entities || []);
    if (this._config.scene_entity) extras.add(this._config.scene_entity);
    if (this._config.scene_start_entity) extras.add(this._config.scene_start_entity);
    for (const section of ["overview", "controls", "configuration", "diagnostics"]) {
      for (const entityId of this._config[`${section}_entities`] || []) extras.add(entityId);
    }
    if (this._config.map_entity) extras.add(this._config.map_entity);

    const result = [];
    for (const [entityId, stateObj] of Object.entries(this._hass.states || {})) {
      if (entityId === selected) continue;
      const domain = domainOf(entityId);
      if (!SUPPORTED_DOMAINS.has(domain)) continue;
      const entry = this._registryEntry(entityId);
      const sameDevice = Boolean(deviceId && entry?.device_id === deviceId);
      const entityName = entityId.split(".")[1]?.toLowerCase() || "";
      const friendly = String(stateObj.attributes?.friendly_name || "").toLowerCase();
      const sameName =
        Boolean(base && (entityName.includes(base) || base.includes(entityName))) ||
        Boolean(robotName && friendly.startsWith(`${robotName} `));
      if (!sameDevice && !sameName && !extras.has(entityId)) continue;

      result.push({
        id: entityId,
        domain,
        stateObj,
        label: this._shortLabel(entityId, stateObj),
        explicit: extras.has(entityId),
      });
    }
    result.sort((a, b) => a.label.localeCompare(b.label));
    return result;
  }

  _tabs() {
    const tabs = [];
    if (this._config.show_overview) tabs.push(["overview", "Overview", "mdi:view-dashboard-outline"]);
    if (this._config.show_controls) tabs.push(["controls", "Controls", "mdi:remote"]);
    if (this._config.show_configuration) tabs.push(["configuration", "Configuration", "mdi:cog-outline"]);
    if (this._config.show_diagnostics) tabs.push(["diagnostics", "Diagnostics", "mdi:chart-box-outline"]);
    return tabs;
  }

  _ensureValidTab() {
    if (!this._config) return;
    const names = this._tabs().map(([name]) => name);
    if (!names.includes(this._selectedTab)) this._selectedTab = names[0] || "";
  }

  _entityBy(predicate) {
    return this._entities.find(predicate) || null;
  }

  _battery() {
    const vacuum = this._vacuumState();
    const sensor = this._entityBy(
      (item) =>
        item.domain === "sensor" &&
        (item.stateObj.attributes?.device_class === "battery" || /battery/i.test(`${item.id} ${item.label}`)),
    );
    const sensorValue = numeric(sensor?.stateObj?.state);
    const attributeValue = numeric(vacuum?.attributes?.battery_level);
    const value = sensorValue ?? attributeValue;
    return value === null ? "—" : `${Math.round(value)}%`;
  }

  _waterLevel() {
    const sensor = this._entityBy(
      (item) => item.domain === "sensor" && /water.*level|water_level/i.test(`${item.id} ${item.label}`),
    );
    return sensor ? this._formatState(sensor) : "—";
  }

  _dockStatus() {
    const sensor = this._entityBy(
      (item) => item.domain === "sensor" && /dock.*status|charging status|^charging$/i.test(`${item.id} ${item.label}`),
    );
    if (sensor) return this._formatState(sensor, false);
    const state = this._vacuumState()?.state;
    if (state === "docked") return "Docked";
    if (state === "returning") return "Returning";
    return state ? titleCase(state) : "—";
  }

  _formatState(item, includeUnit = true) {
    const raw = item?.stateObj?.state;
    if (raw === undefined || raw === null || raw === "unknown" || raw === "unavailable") {
      return raw ? titleCase(raw) : "—";
    }
    const unit = includeUnit ? item.stateObj.attributes?.unit_of_measurement || "" : "";
    const value = numeric(raw);
    if (value !== null) {
      const digits = Number.isInteger(value) ? 0 : Math.abs(value) < 10 ? 2 : 1;
      const separator = unit === "%" ? "" : " ";
      return `${value.toLocaleString(this._locale(), { maximumFractionDigits: digits })}${
        unit ? `${separator}${unit}` : ""
      }`;
    }
    return `${titleCase(raw)}${unit ? ` ${unit}` : ""}`;
  }

  _locale() {
    return this._hass?.locale?.language || globalThis.navigator?.language || "en";
  }

  _iconFor(item) {
    if (item?.stateObj?.attributes?.icon) return item.stateObj.attributes.icon;
    const text = `${item?.id || ""} ${item?.label || ""}`.toLowerCase();
    if (/battery/.test(text)) return ICONS.battery;
    if (/water|mop/.test(text)) return ICONS.water;
    if (/dock|charging/.test(text)) return ICONS.dock;
    if (/area|target|room|map/.test(text)) return ICONS.area;
    if (/time|duration/.test(text)) return ICONS.time;
    if (/wifi|ssid|signal|ip address/.test(text)) return ICONS.wifi;
    if (/filter/.test(text)) return ICONS.filter;
    if (/brush/.test(text)) return ICONS.brush;
    if (/suction|fan/.test(text)) return ICONS.suction;
    if (/lock/.test(text)) return ICONS.lock;
    if (/reset/.test(text)) return ICONS.reset;
    const domainIcons = {
      binary_sensor: "mdi:checkbox-marked-circle-outline",
      button: "mdi:gesture-tap-button",
      camera: "mdi:camera-outline",
      image: "mdi:image-outline",
      number: "mdi:numeric",
      input_number: "mdi:numeric",
      scene: "mdi:palette-outline",
      script: "mdi:script-text-outline",
      select: "mdi:form-dropdown",
      input_select: "mdi:form-dropdown",
      sensor: "mdi:eye-outline",
      switch: "mdi:toggle-switch-outline",
      input_boolean: "mdi:toggle-switch-outline",
      time: "mdi:clock-outline",
    };
    return domainIcons[item?.domain] || "mdi:information-outline";
  }

  _category(item) {
    const text = `${item.id} ${item.label}`.toLowerCase();
    if (["sensor", "binary_sensor"].includes(item.domain)) return "diagnostics";
    if (["camera", "image"].includes(item.domain)) return "map";
    if (["script", "scene"].includes(item.domain)) return "controls";
    if (item.domain === "button") return /reset/.test(text) ? "configuration" : "controls";
    if (["switch", "input_boolean", "automation"].includes(item.domain)) {
      return /find.*robot|locate/.test(text) ? "controls" : "configuration";
    }
    if (["number", "input_number", "time"].includes(item.domain)) return "configuration";
    if (["select", "input_select"].includes(item.domain)) {
      return /room|scene|task|suction|fan|intensity/.test(text) ? "controls" : "configuration";
    }
    return "configuration";
  }

  _manualAssignments() {
    const assignments = new Map();
    for (const section of ["overview", "controls", "configuration", "diagnostics"]) {
      if (this._config[`${section}_entity_mode`] !== "selected") continue;
      for (const entityId of this._config[`${section}_entities`] || []) {
        assignments.set(entityId, section);
      }
    }
    return assignments;
  }

  _entitiesForSection(section, automaticPredicate) {
    const hidden = new Set(this._config[`hidden_${section}_entities`] || []);
    if (this._config[`${section}_entity_mode`] === "selected") {
      const byId = new Map(this._entities.map((item) => [item.id, item]));
      return (this._config[`${section}_entities`] || [])
        .map((entityId) => byId.get(entityId))
        .filter(Boolean);
    }
    const assignments = this._manualAssignments();
    const automatic = this._entities.filter(
      (item) => automaticPredicate(item) && !assignments.has(item.id) && !hidden.has(item.id),
    );
    return applyEntityOrder(automatic, this._config[`${section}_entity_order`]);
  }

  _isSectionItemVisible(section, itemId) {
    if (this._config[`${section}_entity_mode`] === "selected") {
      return (this._config[`${section}_entities`] || []).includes(itemId);
    }
    return !(this._config[`hidden_${section}_entities`] || []).includes(itemId);
  }

  _mapEntity() {
    const hidden = new Set(this._config.hidden_overview_entities || []);
    const selectedMode = this._config.overview_entity_mode === "selected";
    const selected = new Set(this._config.overview_entities || []);
    const isSuppressed = (entityId) =>
      selectedMode ? !selected.has(entityId) : hidden.has(entityId);
    if (this._config.map_entity && this._hass?.states?.[this._config.map_entity]) {
      if (isSuppressed(this._config.map_entity)) return null;
      return this._entities.find((item) => item.id === this._config.map_entity) || {
        id: this._config.map_entity,
        domain: domainOf(this._config.map_entity),
        stateObj: this._hass.states[this._config.map_entity],
        label: "Map",
      };
    }
    return this._entityBy(
      (item) =>
        !isSuppressed(item.id) &&
        ["camera", "image"].includes(item.domain) &&
        /map/i.test(`${item.id} ${item.label}`),
    );
  }

  _mapUrl(item) {
    if (!item) return "";
    const picture = item.stateObj?.attributes?.entity_picture;
    if (picture) return picture;
    if (item.domain === "camera") return `/api/camera_proxy/${item.id}`;
    if (item.domain === "image") return `/api/image_proxy/${item.id}`;
    return "";
  }

  _sceneSelectEntity() {
    if (this._config.scene_entity && this._hass?.states?.[this._config.scene_entity]) {
      return this._config.scene_entity;
    }
    return this._entityBy(
      (item) =>
        ["select", "input_select"].includes(item.domain) &&
        /scene.*task|task.*scene|scene\/task/i.test(`${item.id} ${item.label}`),
    )?.id;
  }

  _sceneStartEntity() {
    if (this._config.scene_start_entity && this._hass?.states?.[this._config.scene_start_entity]) {
      return this._config.scene_start_entity;
    }
    return this._entityBy(
      (item) => item.domain === "button" && /start.*clean|clean.*start/i.test(`${item.id} ${item.label}`),
    )?.id;
  }

  _vacuumStatus() {
    const state = this._vacuumState();
    return titleCase(state?.attributes?.status || state?.state || "Unavailable");
  }

  _activeCleaningTarget() {
    if (!this._isCleaning()) return "";
    const target = this._entityBy(
      (item) =>
        ["sensor", "text", "input_text"].includes(item.domain) &&
        /active.*cleaning.*target|cleaning.*target.*active/i.test(`${item.id} ${item.label}`),
    )?.stateObj?.state;
    const value = String(target || "").trim();
    return !value || ["none", "unknown", "unavailable"].includes(value.toLowerCase()) ? "" : value;
  }

  _headerStatus() {
    const status = this._vacuumStatus();
    const target = this._activeCleaningTarget();
    return target ? `${status} (${target})` : status;
  }

  _isCleaning() {
    return ["cleaning", "spot_cleaning"].includes(this._vacuumState()?.state);
  }

  _capturePanelScroll() {
    const panel = this.shadowRoot?.querySelector?.(".tab-panel");
    if (!panel || !this._renderedTab) return;
    const position = panel.scrollTop || 0;
    const remembered = this._tabScrollPositions.get(this._renderedTab) || 0;
    if (position === 0 && remembered > 0 && Date.now() < this._restorePendingUntil) return;
    this._tabScrollPositions.set(this._renderedTab, position);
  }

  _restorePanelScroll() {
    const panel = this.shadowRoot?.querySelector?.(".tab-panel");
    if (!panel) return;
    panel.scrollTop = this._tabScrollPositions.get(this._selectedTab) || 0;
  }

  _schedulePanelScrollRestore() {
    if (!this.shadowRoot?.querySelector?.(".tab-panel")) return;
    const generation = ++this._scrollRestoreGeneration;
    this._restorePendingUntil = Date.now() + 250;
    const restore = () => {
      if (generation !== this._scrollRestoreGeneration) return;
      this._restorePanelScroll();
    };
    restore();
    Promise.resolve().then(restore);
    if (globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(restore));
    }
    globalThis.setTimeout(restore, 40);
    globalThis.setTimeout(() => {
      restore();
      if (generation === this._scrollRestoreGeneration) this._restorePendingUntil = 0;
    }, 160);
  }

  _renderOrDefer() {
    const remaining = this._scrollingUntil - Date.now();
    if (remaining > 0) {
      if (this._deferredRenderTimer) globalThis.clearTimeout(this._deferredRenderTimer);
      this._deferredRenderTimer = globalThis.setTimeout(() => {
        this._deferredRenderTimer = null;
        this._entities = this._discoverEntities();
        this._ensureValidTab();
        this._renderOrDefer();
      }, remaining + 35);
      return;
    }
    if (this._deferredRenderTimer) {
      globalThis.clearTimeout(this._deferredRenderTimer);
      this._deferredRenderTimer = null;
    }
    this._render();
  }

  disconnectedCallback() {
    if (this._deferredRenderTimer) globalThis.clearTimeout(this._deferredRenderTimer);
    this._deferredRenderTimer = null;
    this._scrollRestoreGeneration += 1;
  }

  _render() {
    if (!this.shadowRoot) return;
    this._capturePanelScroll();
    if (!this._config) {
      this.shadowRoot.innerHTML = "";
      return;
    }
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<ha-card><div style="padding:20px">Loading vacuum card…</div></ha-card>`;
      return;
    }

    const vacuum = this._vacuumState();
    const unavailable = !vacuum || ["unknown", "unavailable"].includes(vacuum.state);
    const name = this._robotName();
    const tabs = this._tabs();
    const active = this._isCleaning();

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="card-content">
          <header class="robot-header">
            <div class="robot-identity">
              <div class="robot-icon ${active ? "active" : ""}">
                <ha-icon icon="mdi:robot-vacuum"></ha-icon>
              </div>
              <div class="robot-title">
                <h2>${escapeHtml(name)}</h2>
                <div class="status-line">
                  <span class="status-dot ${active ? "active" : unavailable ? "unavailable" : ""}"></span>
                  ${escapeHtml(this._headerStatus())}
                </div>
              </div>
            </div>
            <button class="more-info" data-more-info="${escapeHtml(this._config.entity)}" aria-label="More information">
              <ha-icon icon="mdi:dots-vertical"></ha-icon>
            </button>
          </header>

          <section class="summary-grid">
            ${this._summaryTile(ICONS.battery, "Battery", this._battery(), "green")}
            ${this._summaryTile(ICONS.water, "Water level", this._waterLevel(), "blue")}
            ${this._summaryTile(ICONS.dock, "Dock", this._dockStatus(), "purple")}
          </section>

          ${this._config.show_quick_controls ? this._renderQuickControls(unavailable) : ""}
          ${this._renderSceneButtons(unavailable)}

          ${
            tabs.length
              ? `<nav class="tabs" aria-label="Vacuum menu">
                  ${tabs
                    .map(
                      ([id, label, icon]) => `<button data-tab="${id}" class="${
                        this._selectedTab === id ? "active" : ""
                      }" title="${label}">
                        <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
                      </button>`,
                    )
                    .join("")}
                </nav>`
              : ""
          }

          <section class="tab-panel">
            ${this._renderSelectedTab()}
          </section>

          ${
            this._actionError
              ? `<div class="action-error"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${escapeHtml(
                  this._actionError,
                )}</div>`
              : ""
          }
        </div>
      </ha-card>
    `;
    this._attachEvents();
    this._renderedTab = this._selectedTab;
    this._schedulePanelScrollRestore();
  }

  _summaryTile(icon, label, value, tone) {
    return `<div class="summary-tile">
      <div class="summary-icon ${tone}"><ha-icon icon="${icon}"></ha-icon></div>
      <span>${label}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>`;
  }

  _renderQuickControls(unavailable) {
    const cleaning = this._isCleaning();
    const actions = [
      [cleaning ? "pause" : "start", cleaning ? "mdi:pause" : "mdi:play", cleaning ? "Pause" : "Start"],
      ["stop", "mdi:stop", "Stop"],
      ["return_to_base", "mdi:home-map-marker", "Home"],
      ["locate", "mdi:crosshairs-gps", "Locate"],
    ];
    return `<section class="quick-controls">
      ${actions
        .map(
          ([action, icon, label]) => `<button data-vacuum-action="${action}" ${unavailable ? "disabled" : ""}>
            <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
          </button>`,
        )
        .join("")}
    </section>`;
  }

  _renderSceneButtons(unavailable) {
    const buttons = this._config.scene_buttons || [];
    if (!this._config.show_scene_buttons || !buttons.length) return "";
    const sceneEntity = this._sceneSelectEntity();
    return `<section class="scene-quick-buttons">
      ${buttons
        .map((button, index) => {
          const color = safeColor(button.color);
          const icon = safeMdiIcon(button.icon);
          const name = button.name || button.option || `Scene ${index + 1}`;
          return `<button data-scene-button="${index}" style="--scene-button-color:${color}" ${
            unavailable || !sceneEntity || !button.option ? "disabled" : ""
          }>
            <ha-icon icon="${icon}"></ha-icon>
            <span>${escapeHtml(name)}</span>
          </button>`;
        })
        .join("")}
    </section>`;
  }

  _renderSelectedTab() {
    if (this._selectedTab === "controls") return this._renderControls();
    if (this._selectedTab === "configuration") return this._renderConfiguration();
    if (this._selectedTab === "diagnostics") return this._renderDiagnostics();
    return this._renderOverview();
  }

  _renderOverview() {
    const map = this._config.show_map ? this._mapEntity() : null;
    const mapUrl = this._mapUrl(map);
    const highlights = this._entitiesForSection(
      "overview",
      (item) =>
        item.domain === "sensor" &&
        /active map|cleaning area|cleaning time|task status|total cleaning|work mode|wifi signal/i.test(
          `${item.id} ${item.label}`,
        ),
    )
      .slice(0, 8);
    const fanSpeed = this._isSectionItemVisible("overview", suctionVisibilityId("overview"))
      ? this._vacuumState()?.attributes?.fan_speed
      : null;

    return `<div class="overview-layout ${mapUrl ? "with-map" : ""}">
      ${
        mapUrl
          ? `<button class="map-frame" data-more-info="${escapeHtml(map.id)}" aria-label="Open map">
              <img src="${escapeHtml(mapUrl)}" alt="${escapeHtml(map.label || "Vacuum map")}">
              <span><ha-icon icon="mdi:map-outline"></ha-icon>${escapeHtml(map.label || "Map")}</span>
            </button>`
          : ""
      }
      <div class="overview-info">
        <div class="section-title"><ha-icon icon="mdi:information-outline"></ha-icon><strong>Vacuum information</strong></div>
        <div class="info-grid ${this._config.overview_info_layout === "grid" ? "grid" : "list"}">
          ${
            fanSpeed
              ? this._infoTile("mdi:fan", "Suction level", titleCase(fanSpeed))
              : ""
          }
          ${highlights
            .map((item) => this._infoTile(this._iconFor(item), item.label, this._formatState(item)))
            .join("")}
        </div>
        ${
          !fanSpeed && !highlights.length
            ? `<div class="empty-state">Robot information will appear as its sensor entities become available.</div>`
            : ""
        }
      </div>
    </div>`;
  }

  _infoTile(icon, label, value) {
    return `<button class="info-tile" type="button">
      <ha-icon icon="${icon}"></ha-icon>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </button>`;
  }

  _renderControls() {
    const controls = this._entitiesForSection(
      "controls",
      (item) => this._category(item) === "controls",
    );
    const fanOptions = this._isSectionItemVisible("controls", suctionVisibilityId("controls"))
      ? this._vacuumState()?.attributes?.fan_speed_list || []
      : [];
    const fanSpeed = this._vacuumState()?.attributes?.fan_speed;
    return `<div class="entity-section">
      <div class="section-title"><ha-icon icon="mdi:remote"></ha-icon><strong>Additional controls</strong></div>
      ${
        fanOptions.length
          ? `<div class="control-row select-row">
              <ha-icon icon="mdi:fan"></ha-icon>
              <label><span>Suction level</span><strong>${escapeHtml(titleCase(fanSpeed || "Unknown"))}</strong></label>
              <select data-fan-speed aria-label="Suction level">
                ${fanOptions
                  .map(
                    (option) => `<option value="${escapeHtml(option)}" ${option === fanSpeed ? "selected" : ""}>${escapeHtml(
                      titleCase(option),
                    )}</option>`,
                  )
                  .join("")}
              </select>
            </div>`
          : ""
      }
      ${controls.map((item) => this._renderEntityControl(item)).join("")}
      ${
        !fanOptions.length && !controls.length
          ? `<div class="empty-state">No additional controls were found. The main vacuum commands are available above.</div>`
          : ""
      }
    </div>`;
  }

  _renderConfiguration() {
    const entities = this._entitiesForSection(
      "configuration",
      (item) => this._category(item) === "configuration",
    );
    return `<div class="entity-section">
      <div class="section-title"><ha-icon icon="mdi:cog-outline"></ha-icon><strong>Configuration</strong></div>
      ${entities.map((item) => this._renderEntityControl(item)).join("")}
      ${
        entities.length
          ? ""
          : `<div class="empty-state">No configuration entities were found for this vacuum device.</div>`
      }
    </div>`;
  }

  _renderEntityControl(item) {
    const icon = this._iconFor(item);
    const current = item.stateObj.state;
    const unavailable = ["unknown", "unavailable"].includes(current);
    const buttonUnavailable = current === "unavailable";

    if (["sensor", "binary_sensor", "camera", "image"].includes(item.domain)) {
      return `<div class="control-row ${unavailable ? "unavailable" : ""}">
        <ha-icon icon="${icon}"></ha-icon>
        <label><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(
          this._formatState(item),
        )}</strong></label>
        <button class="press" data-more-info="${escapeHtml(item.id)}">Details</button>
      </div>`;
    }

    if (["select", "input_select"].includes(item.domain)) {
      const options = item.stateObj.attributes?.options || [];
      return `<div class="control-row select-row ${unavailable ? "unavailable" : ""}">
        <ha-icon icon="${icon}"></ha-icon>
        <label><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(titleCase(current))}</strong></label>
        <select data-entity-select="${escapeHtml(item.id)}" ${unavailable ? "disabled" : ""}>
          ${options
            .map(
              (option) => `<option value="${escapeHtml(option)}" ${option === current ? "selected" : ""}>${escapeHtml(
                titleCase(option),
              )}</option>`,
            )
            .join("")}
        </select>
      </div>`;
    }

    if (["switch", "input_boolean", "automation"].includes(item.domain)) {
      const on = current === "on";
      return `<div class="control-row ${unavailable ? "unavailable" : ""}">
        <ha-icon icon="${icon}"></ha-icon>
        <label><span>${escapeHtml(item.label)}</span><strong>${on ? "On" : titleCase(current)}</strong></label>
        <button class="toggle ${on ? "on" : ""}" data-entity-toggle="${escapeHtml(item.id)}" role="switch" aria-checked="${on}" ${
          unavailable ? "disabled" : ""
        }><span></span></button>
      </div>`;
    }

    if (["number", "input_number"].includes(item.domain)) {
      const attrs = item.stateObj.attributes || {};
      return `<div class="control-row value-row ${unavailable ? "unavailable" : ""}">
        <ha-icon icon="${icon}"></ha-icon>
        <label><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(this._formatState(item))}</strong></label>
        <input type="number" value="${escapeHtml(current)}" min="${escapeHtml(attrs.min ?? "")}" max="${escapeHtml(
          attrs.max ?? "",
        )}" step="${escapeHtml(attrs.step ?? 1)}" data-entity-number="${escapeHtml(item.id)}" ${
          unavailable ? "disabled" : ""
        }>
      </div>`;
    }

    if (item.domain === "time") {
      return `<div class="control-row value-row ${unavailable ? "unavailable" : ""}">
        <ha-icon icon="${icon}"></ha-icon>
        <label><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(current)}</strong></label>
        <input type="time" step="1" value="${escapeHtml(current)}" data-entity-time="${escapeHtml(item.id)}" ${
          unavailable ? "disabled" : ""
        }>
      </div>`;
    }

    const pressLabel = item.domain === "script" || item.domain === "scene" ? "Run" : "Press";
    const stateLabel =
      item.domain === "button"
        ? ""
        : `<strong>${escapeHtml(titleCase(current))}</strong>`;
    return `<div class="control-row ${buttonUnavailable && item.domain === "button" ? "unavailable" : ""}">
      <ha-icon icon="${icon}"></ha-icon>
      <label><span>${escapeHtml(item.label)}</span>${stateLabel}</label>
      <button class="press" data-entity-press="${escapeHtml(item.id)}" ${
        buttonUnavailable && item.domain === "button" ? "disabled" : ""
      }>${pressLabel}</button>
    </div>`;
  }

  _renderDiagnostics() {
    const sensors = this._entitiesForSection(
      "diagnostics",
      (item) => this._category(item) === "diagnostics",
    );
    return `<div class="entity-section diagnostics">
      <div class="section-title"><ha-icon icon="mdi:chart-box-outline"></ha-icon><strong>Diagnostics</strong><span>${
        sensors.length
      } entities</span></div>
      ${sensors
        .map(
          (item) => `<button class="diagnostic-row" data-more-info="${escapeHtml(item.id)}">
            <ha-icon icon="${this._iconFor(item)}"></ha-icon>
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(this._formatState(item))}</strong>
          </button>`,
        )
        .join("")}
      ${sensors.length ? "" : `<div class="empty-state">No diagnostic sensors were found.</div>`}
    </div>`;
  }

  async _callService(domain, service, data) {
    if (!this._hass?.callService) return false;
    try {
      this._actionError = "";
      await this._hass.callService(domain, service, data);
      return true;
    } catch (error) {
      this._actionError = error?.message || `Could not run ${domain}.${service}`;
      this._render();
      return false;
    }
  }

  _callVacuum(action) {
    return this._callService("vacuum", action, { entity_id: this._config.entity });
  }

  async _runSceneButton(index) {
    const button = this._config.scene_buttons?.[index];
    const sceneEntity = this._sceneSelectEntity();
    if (!button?.option || !sceneEntity) {
      this._actionError = "Select a Scene/Task entity and option in the card settings";
      this._render();
      return;
    }

    const selected = await this._callService(domainOf(sceneEntity), "select_option", {
      entity_id: sceneEntity,
      option: button.option,
    });
    if (!selected) return;

    const startEntity = this._sceneStartEntity();
    if (!startEntity) {
      await this._callVacuum("start");
      return;
    }
    const domain = domainOf(startEntity);
    await this._callService(domain, domain === "button" ? "press" : "turn_on", {
      entity_id: startEntity,
    });
  }

  _showMoreInfo(entityId) {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _attachEvents() {
    const panel = this.shadowRoot.querySelector(".tab-panel");
    if (panel) {
      const tab = this._selectedTab;
      panel.addEventListener(
        "scroll",
        () => {
          const position = panel.scrollTop || 0;
          const remembered = this._tabScrollPositions.get(tab) || 0;
          if (position === 0 && remembered > 0 && Date.now() < this._restorePendingUntil) return;
          this._tabScrollPositions.set(tab, position);
          this._scrollingUntil = Date.now() + 700;
        },
        { passive: true },
      );
    }
    this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedTab = button.dataset.tab;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-vacuum-action]").forEach((button) => {
      button.addEventListener("click", () => this._callVacuum(button.dataset.vacuumAction));
    });
    this.shadowRoot.querySelectorAll("[data-scene-button]").forEach((button) => {
      button.addEventListener("click", () => this._runSceneButton(Number(button.dataset.sceneButton)));
    });
    this.shadowRoot.querySelectorAll("[data-more-info]").forEach((button) => {
      button.addEventListener("click", () => this._showMoreInfo(button.dataset.moreInfo));
    });
    this.shadowRoot.querySelector("[data-fan-speed]")?.addEventListener("change", (event) => {
      this._callService("vacuum", "set_fan_speed", {
        entity_id: this._config.entity,
        fan_speed: event.target.value,
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-select]").forEach((select) => {
      select.addEventListener("change", () => {
        const entityId = select.dataset.entitySelect;
        const domain = domainOf(entityId);
        this._callService(domain, "select_option", { entity_id: entityId, option: select.value });
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const entityId = button.dataset.entityToggle;
        const domain = domainOf(entityId);
        const isOn = this._hass.states[entityId]?.state === "on";
        this._callService(domain, isOn ? "turn_off" : "turn_on", { entity_id: entityId });
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-number]").forEach((input) => {
      input.addEventListener("change", () => {
        const entityId = input.dataset.entityNumber;
        this._callService(domainOf(entityId), "set_value", {
          entity_id: entityId,
          value: Number(input.value),
        });
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-time]").forEach((input) => {
      input.addEventListener("change", () => {
        const entityId = input.dataset.entityTime;
        this._callService("time", "set_value", { entity_id: entityId, time: input.value });
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-press]").forEach((button) => {
      button.addEventListener("click", () => {
        const entityId = button.dataset.entityPress;
        const domain = domainOf(entityId);
        const service = domain === "button" ? "press" : "turn_on";
        this._callService(domain, service, { entity_id: entityId });
      });
    });
    this.shadowRoot.querySelector(".map-frame img")?.addEventListener("error", (event) => {
      event.target.closest(".map-frame")?.classList.add("map-error");
    });
  }

  _styles() {
    return `
      :host {
        display: block;
        --vacuum-accent: var(--primary-color, #b58cff);
        --vacuum-green: #43d17a;
        --vacuum-blue: #3ba1ff;
        --vacuum-purple: #b58cff;
      }
      * { box-sizing: border-box; }
      ha-card { overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
      .card-content { padding: 18px; }
      button, select, input { font: inherit; }
      button { color: inherit; }
      .robot-header, .robot-identity, .status-line, .section-title, .control-row, .diagnostic-row {
        display: flex;
        align-items: center;
      }
      .robot-header { justify-content: space-between; gap: 12px; }
      .robot-identity { min-width: 0; gap: 12px; }
      .robot-icon {
        width: 48px;
        height: 48px;
        border-radius: 15px;
        display: grid;
        place-items: center;
        color: var(--vacuum-purple);
        background: color-mix(in srgb, var(--vacuum-purple) 17%, var(--secondary-background-color));
      }
      .robot-icon.active { color: var(--vacuum-green); background: color-mix(in srgb, var(--vacuum-green) 18%, var(--secondary-background-color)); }
      .robot-icon ha-icon { --mdc-icon-size: 27px; }
      .robot-title { min-width: 0; }
      .robot-title h2 { margin: 0; font-size: 23px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status-line { gap: 6px; margin-top: 4px; color: var(--secondary-text-color); font-size: 12px; }
      .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--vacuum-purple); box-shadow: 0 0 8px color-mix(in srgb, var(--vacuum-purple) 60%, transparent); }
      .status-dot.active { background: var(--vacuum-green); box-shadow: 0 0 8px color-mix(in srgb, var(--vacuum-green) 60%, transparent); }
      .status-dot.unavailable { background: var(--disabled-text-color); box-shadow: none; }
      .more-info {
        width: 38px;
        height: 38px;
        border: 0;
        border-radius: 50%;
        background: transparent;
        cursor: pointer;
      }
      .summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin-top: 16px; }
      .summary-tile {
        min-width: 0;
        padding: 11px 8px;
        border-radius: 13px;
        text-align: center;
        background: var(--secondary-background-color);
      }
      .summary-icon { width: 34px; height: 34px; margin: 0 auto 7px; border-radius: 50%; display: grid; place-items: center; }
      .summary-icon ha-icon { --mdc-icon-size: 20px; }
      .summary-icon.green { color: var(--vacuum-green); background: color-mix(in srgb, var(--vacuum-green) 18%, transparent); }
      .summary-icon.blue { color: var(--vacuum-blue); background: color-mix(in srgb, var(--vacuum-blue) 18%, transparent); }
      .summary-icon.purple { color: var(--vacuum-purple); background: color-mix(in srgb, var(--vacuum-purple) 18%, transparent); }
      .summary-tile span { display: block; color: var(--secondary-text-color); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .summary-tile strong { display: block; margin-top: 2px; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .quick-controls { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
      .quick-controls button {
        min-height: 48px;
        border: 0;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: var(--secondary-background-color);
        cursor: pointer;
      }
      .quick-controls button:hover { background: color-mix(in srgb, var(--vacuum-accent) 14%, var(--secondary-background-color)); }
      .quick-controls button:disabled { opacity: .45; cursor: default; }
      .quick-controls ha-icon { color: var(--vacuum-accent); --mdc-icon-size: 19px; }
      .quick-controls span { font-size: 11px; }
      .scene-quick-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin-top: 9px; }
      .scene-quick-buttons button {
        min-height: 47px;
        padding: 9px 12px;
        border: 1px solid color-mix(in srgb, var(--scene-button-color) 42%, var(--divider-color));
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        color: var(--scene-button-color);
        background: color-mix(in srgb, var(--scene-button-color) 13%, var(--secondary-background-color));
        cursor: pointer;
      }
      .scene-quick-buttons button:hover { background: color-mix(in srgb, var(--scene-button-color) 23%, var(--secondary-background-color)); }
      .scene-quick-buttons button:disabled { opacity: .45; cursor: default; }
      .scene-quick-buttons ha-icon { --mdc-icon-size: 20px; }
      .scene-quick-buttons span { color: var(--primary-text-color); font-size: 11px; font-weight: 600; }
      .tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; margin-top: 16px; padding: 4px; border-radius: 13px; background: var(--secondary-background-color); }
      .tabs button { min-width: 0; padding: 9px 5px; border: 0; border-radius: 9px; display: flex; align-items: center; justify-content: center; gap: 5px; color: var(--secondary-text-color); background: transparent; cursor: pointer; }
      .tabs button.active { color: var(--primary-text-color); background: color-mix(in srgb, var(--vacuum-accent) 22%, var(--card-background-color)); }
      .tabs ha-icon { --mdc-icon-size: 17px; }
      .tabs span { overflow: hidden; text-overflow: ellipsis; font-size: 11px; }
      .tab-panel { margin-top: 14px; max-height: 630px; overflow: auto; scrollbar-width: thin; }
      .overview-layout.with-map { display: grid; grid-template-columns: minmax(180px, .9fr) minmax(220px, 1.1fr); gap: 12px; }
      .map-frame { position: relative; min-height: 220px; padding: 0; overflow: hidden; border: 1px solid var(--divider-color); border-radius: 14px; background: var(--secondary-background-color); cursor: pointer; }
      .map-frame img { width: 100%; height: 100%; min-height: 220px; max-height: 360px; object-fit: contain; display: block; }
      .map-frame > span { position: absolute; left: 9px; bottom: 9px; display: flex; align-items: center; gap: 5px; padding: 5px 8px; border-radius: 8px; color: white; background: #111a; font-size: 11px; }
      .map-frame.map-error img { display: none; }
      .map-frame.map-error::before { content: "Map image unavailable"; position: absolute; inset: 0; display: grid; place-items: center; color: var(--secondary-text-color); }
      .overview-info, .entity-section { padding: 13px; border-radius: 14px; background: var(--secondary-background-color); }
      .section-title { gap: 7px; margin-bottom: 11px; }
      .section-title ha-icon { color: var(--vacuum-accent); --mdc-icon-size: 19px; }
      .section-title > span { margin-left: auto; color: var(--secondary-text-color); font-size: 10px; }
      .info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .info-tile { min-width: 0; padding: 10px; border: 0; border-radius: 11px; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 7px; text-align: left; background: var(--card-background-color); }
      .info-tile ha-icon { grid-row: 1 / span 2; color: var(--vacuum-accent); --mdc-icon-size: 19px; }
      .info-tile span { color: var(--secondary-text-color); font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .info-tile strong { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .info-grid.list { grid-template-columns: 1fr; gap: 0; }
      .info-grid.list .info-tile { min-height: 46px; padding: 8px 4px; border-top: 1px solid var(--divider-color); border-radius: 0; grid-template-columns: auto minmax(0, 1fr) auto; background: transparent; }
      .info-grid.list .info-tile:first-child { border-top: 0; }
      .info-grid.list .info-tile ha-icon { grid-row: auto; }
      .info-grid.list .info-tile span { font-size: 11px; }
      .info-grid.list .info-tile strong { text-align: right; }
      .empty-state { padding: 18px 10px; border: 1px dashed var(--divider-color); border-radius: 11px; color: var(--secondary-text-color); text-align: center; font-size: 12px; }
      .control-row { min-height: 58px; gap: 10px; padding: 8px 4px; border-top: 1px solid var(--divider-color); }
      .section-title + .control-row { border-top: 0; }
      .control-row > ha-icon { flex: 0 0 auto; color: var(--vacuum-accent); --mdc-icon-size: 20px; }
      .control-row label { min-width: 0; flex: 1; }
      .control-row label span, .control-row label strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .control-row label span { font-size: 12px; }
      .control-row label strong { margin-top: 2px; color: var(--secondary-text-color); font-size: 10px; font-weight: 500; }
      .control-row.unavailable { opacity: .5; }
      .select-row select, .value-row input { width: min(155px, 42%); border: 1px solid var(--divider-color); border-radius: 9px; padding: 8px; color: var(--primary-text-color); background: var(--card-background-color); }
      .press { border: 0; padding: 8px 10px; color: var(--vacuum-accent); background: transparent; font-weight: 700; cursor: pointer; }
      .toggle { width: 42px; height: 24px; padding: 3px; border: 1px solid var(--divider-color); border-radius: 999px; background: var(--card-background-color); cursor: pointer; }
      .toggle span { display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--disabled-text-color); transition: transform .15s ease; }
      .toggle.on { background: color-mix(in srgb, var(--vacuum-accent) 45%, var(--card-background-color)); }
      .toggle.on span { transform: translateX(17px); background: var(--vacuum-accent); }
      .diagnostic-row { width: 100%; min-height: 45px; gap: 10px; padding: 8px 4px; border: 0; border-top: 1px solid var(--divider-color); text-align: left; background: transparent; cursor: pointer; }
      .section-title + .diagnostic-row { border-top: 0; }
      .diagnostic-row ha-icon { flex: 0 0 auto; color: var(--vacuum-accent); --mdc-icon-size: 19px; }
      .diagnostic-row span { min-width: 0; flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .diagnostic-row strong { max-width: 45%; color: var(--primary-text-color); font-size: 11px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .action-error { display: flex; align-items: center; gap: 7px; margin-top: 12px; padding: 9px 11px; border-radius: 10px; color: var(--error-color); background: color-mix(in srgb, var(--error-color) 12%, transparent); font-size: 11px; }
      @media (max-width: 600px) {
        .card-content { padding: 14px; }
        .robot-title h2 { font-size: 20px; }
        .quick-controls span { display: none; }
        .tabs span { display: none; }
        .tabs button { padding: 9px; }
        .tabs ha-icon { --mdc-icon-size: 20px; }
        .overview-layout.with-map { grid-template-columns: 1fr; }
        .map-frame, .map-frame img { min-height: 190px; }
        .select-row select, .value-row input { width: 42%; }
      }
    `;
  }
}

class VacuumRobotMenuCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = { ...DEFAULTS };
    this._registry = new Map();
    this._registryRequested = false;
    this._activeSection = "overview";
    this._stateIdSignature = "";
    this._sectionScrollPositions = new Map();
    this._renderedSection = null;
  }

  set hass(hass) {
    const signature = Object.keys(hass?.states || {}).sort().join("|");
    const shouldRender = !this._hass || signature !== this._stateIdSignature;
    this._hass = hass;
    this._stateIdSignature = signature;
    this._requestRegistry();
    if (shouldRender) this._render();
  }

  setConfig(config) {
    this._config = {
      ...DEFAULTS,
      ...config,
      extra_entities: Array.isArray(config?.extra_entities) ? config.extra_entities : [],
      scene_buttons: Array.isArray(config?.scene_buttons)
        ? config.scene_buttons.map((button) => ({ ...button }))
        : [],
      overview_entities: Array.isArray(config?.overview_entities) ? config.overview_entities : [],
      overview_entity_order: Array.isArray(config?.overview_entity_order) ? config.overview_entity_order : [],
      controls_entities: Array.isArray(config?.controls_entities) ? config.controls_entities : [],
      controls_entity_order: Array.isArray(config?.controls_entity_order) ? config.controls_entity_order : [],
      configuration_entities: Array.isArray(config?.configuration_entities)
        ? config.configuration_entities
        : [],
      configuration_entity_order: Array.isArray(config?.configuration_entity_order)
        ? config.configuration_entity_order
        : [],
      diagnostics_entities: Array.isArray(config?.diagnostics_entities)
        ? config.diagnostics_entities
        : [],
      diagnostics_entity_order: Array.isArray(config?.diagnostics_entity_order)
        ? config.diagnostics_entity_order
        : [],
      hidden_overview_entities: Array.isArray(config?.hidden_overview_entities)
        ? config.hidden_overview_entities
        : [],
      hidden_controls_entities: Array.isArray(config?.hidden_controls_entities)
        ? config.hidden_controls_entities
        : [],
      hidden_configuration_entities: Array.isArray(config?.hidden_configuration_entities)
        ? config.hidden_configuration_entities
        : [],
      hidden_diagnostics_entities: Array.isArray(config?.hidden_diagnostics_entities)
        ? config.hidden_diagnostics_entities
        : [],
    };
    this._render();
  }

  async _requestRegistry() {
    if (this._registryRequested || !this._hass?.callWS) return;
    this._registryRequested = true;
    try {
      const entries = await this._hass.callWS({ type: "config/entity_registry/list" });
      this._registry = new Map((entries || []).map((entry) => [entry.entity_id, entry]));
      this._render();
    } catch (error) {
      console.debug("Eufy Vacuum Card editor: entity registry unavailable", error);
    }
  }

  _registryEntry(entityId) {
    return this._registry.get(entityId) || this._hass?.entities?.[entityId] || null;
  }

  _robotName() {
    const state = this._hass?.states?.[this._config.entity];
    return this._config.title || state?.attributes?.friendly_name || titleCase(this._config.entity?.split(".")[1]);
  }

  _shortLabel(entityId, stateObj) {
    const entry = this._registryEntry(entityId);
    let label =
      stateObj?.attributes?.friendly_name ||
      entry?.name ||
      entry?.original_name ||
      titleCase(entityId.split(".")[1]);
    const robotName = this._robotName();
    if (robotName && label.toLowerCase().startsWith(`${robotName.toLowerCase()} `)) {
      label = label.slice(robotName.length + 1);
    }
    return label;
  }

  _deviceEntities() {
    if (!this._hass || !this._config.entity) return [];
    const selected = this._config.entity;
    const base = selected.split(".")[1]?.toLowerCase() || "";
    const robotName = this._robotName().toLowerCase();
    const deviceId = this._registryEntry(selected)?.device_id;
    const included = new Set(this._config.extra_entities || []);
    if (this._config.map_entity) included.add(this._config.map_entity);
    if (this._config.scene_entity) included.add(this._config.scene_entity);
    if (this._config.scene_start_entity) included.add(this._config.scene_start_entity);
    for (const section of ["overview", "controls", "configuration", "diagnostics"]) {
      for (const entityId of this._config[`${section}_entities`] || []) included.add(entityId);
    }

    const entities = [];
    for (const [entityId, stateObj] of Object.entries(this._hass.states || {})) {
      if (entityId === selected) continue;
      const domain = domainOf(entityId);
      if (!SUPPORTED_DOMAINS.has(domain)) continue;
      const entry = this._registryEntry(entityId);
      const entityName = entityId.split(".")[1]?.toLowerCase() || "";
      const friendly = String(stateObj.attributes?.friendly_name || "").toLowerCase();
      const sameDevice = Boolean(deviceId && entry?.device_id === deviceId);
      const sameName =
        Boolean(base && entityName.includes(base)) ||
        Boolean(robotName && friendly.startsWith(`${robotName} `));
      if (!sameDevice && !sameName && !included.has(entityId)) continue;
      entities.push({
        id: entityId,
        domain,
        label: this._shortLabel(entityId, stateObj),
        stateObj,
      });
    }
    return entities.sort((a, b) => a.label.localeCompare(b.label));
  }

  _category(item) {
    const text = `${item.id} ${item.label}`.toLowerCase();
    if (["sensor", "binary_sensor"].includes(item.domain)) return "diagnostics";
    if (["camera", "image"].includes(item.domain)) return "overview";
    if (["script", "scene"].includes(item.domain)) return "controls";
    if (item.domain === "button") return /reset/.test(text) ? "configuration" : "controls";
    if (["switch", "input_boolean", "automation"].includes(item.domain)) {
      return /find.*robot|locate/.test(text) ? "controls" : "configuration";
    }
    if (["number", "input_number", "time"].includes(item.domain)) return "configuration";
    if (["select", "input_select"].includes(item.domain)) {
      return /room|scene|task|suction|fan|intensity/.test(text) ? "controls" : "configuration";
    }
    return "configuration";
  }

  _automaticOverview(item) {
    if (["camera", "image"].includes(item.domain)) return /map/i.test(`${item.id} ${item.label}`);
    return (
      item.domain === "sensor" &&
      /active map|cleaning area|cleaning time|task status|total cleaning|work mode|wifi signal/i.test(
        `${item.id} ${item.label}`,
      )
    );
  }

  _manualAssignments() {
    const assignments = new Map();
    for (const section of ["overview", "controls", "configuration", "diagnostics"]) {
      if (this._config[`${section}_entity_mode`] !== "selected") continue;
      for (const entityId of this._config[`${section}_entities`] || []) assignments.set(entityId, section);
    }
    return assignments;
  }

  _suctionEditorItem(section) {
    if (!["overview", "controls"].includes(section)) return null;
    const vacuum = this._hass?.states?.[this._config.entity];
    const fanSpeed = vacuum?.attributes?.fan_speed;
    const fanOptions = vacuum?.attributes?.fan_speed_list || [];
    if (fanSpeed == null && !fanOptions.length) return null;
    return {
      id: suctionVisibilityId(section),
      domain: "vacuum_attribute",
      label: "Suction level",
      stateObj: {
        state: fanSpeed || "unknown",
        attributes: { icon: "mdi:fan" },
      },
      virtual: true,
    };
  }

  _sectionEntities(section) {
    const all = this._deviceEntities();
    const suction = this._suctionEditorItem(section);
    if (suction) all.push(suction);
    if (this._config[`${section}_entity_mode`] === "selected") {
      const order = this._config[`${section}_entities`] || [];
      const byId = new Map(all.map((item) => [item.id, item]));
      const selected = order.map((entityId) => byId.get(entityId)).filter(Boolean);
      const selectedIds = new Set(order);
      return [...selected, ...all.filter((item) => !selectedIds.has(item.id))];
    }
    const assignments = this._manualAssignments();
    const automatic = all.filter((item) => {
      if (assignments.has(item.id)) return false;
      if (item.virtual) return true;
      if (section === "overview") return this._automaticOverview(item);
      return this._category(item) === section;
    });
    return applyEntityOrder(automatic, this._config[`${section}_entity_order`]);
  }

  _isVisible(section, entityId) {
    if (this._config[`${section}_entity_mode`] === "selected") {
      return (this._config[`${section}_entities`] || []).includes(entityId);
    }
    return !(this._config[`hidden_${section}_entities`] || []).includes(entityId);
  }

  _setField(name, value) {
    const next = { ...this._config, [name]: value };
    if (name === "entity" && value !== this._config.entity) {
      for (const section of ["overview", "controls", "configuration", "diagnostics"]) {
        next[`${section}_entity_mode`] = "automatic";
        next[`${section}_entities`] = [];
        next[`${section}_entity_order`] = [];
        next[`hidden_${section}_entities`] = [];
      }
      next.scene_entity = "";
      next.scene_start_entity = "";
      next.scene_buttons = [];
    }
    this._config = next;
    this._emitConfig();
    this._render();
  }

  _toggleEntity(section, entityId, visible) {
    const selectedMode = this._config[`${section}_entity_mode`] === "selected";
    const key = selectedMode ? `${section}_entities` : `hidden_${section}_entities`;
    const values = new Set(this._config[key] || []);
    if (selectedMode) {
      if (visible) values.add(entityId);
      else values.delete(entityId);
    } else if (visible) {
      values.delete(entityId);
    } else {
      values.add(entityId);
    }
    this._config = { ...this._config, [key]: [...values] };
    this._emitConfig();
    this._render();
  }

  _moveEntityTo(section, sourceId, targetId, placeAfter = false) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const selectedMode = this._config[`${section}_entity_mode`] === "selected";
    const key = selectedMode ? `${section}_entities` : `${section}_entity_order`;
    const entities = selectedMode
      ? [...(this._config[key] || [])]
      : this._sectionEntities(section).map((item) => item.id);
    const sourceIndex = entities.indexOf(sourceId);
    if (sourceIndex < 0 || !entities.includes(targetId)) return;
    entities.splice(sourceIndex, 1);
    const targetIndex = entities.indexOf(targetId);
    entities.splice(targetIndex + (placeAfter ? 1 : 0), 0, sourceId);
    this._config = { ...this._config, [key]: entities };
    this._emitConfig();
    this._render();
  }

  _emitConfig() {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: { ...this._config } },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _captureEditorScroll() {
    const list = this.shadowRoot?.querySelector?.(".entity-list");
    if (list && this._renderedSection) {
      this._sectionScrollPositions.set(this._renderedSection, list.scrollTop || 0);
    }
  }

  _restoreEditorScroll() {
    const list = this.shadowRoot?.querySelector?.(".entity-list");
    if (!list) return;
    const position = this._sectionScrollPositions.get(this._activeSection) || 0;
    list.scrollTop = position;
    if (globalThis.requestAnimationFrame) {
      globalThis.requestAnimationFrame(() => {
        if (this._renderedSection === this._activeSection) list.scrollTop = position;
      });
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    this._captureEditorScroll();
    if (!this._hass) {
      this.shadowRoot.innerHTML = `<div style="padding:16px">Loading vacuum card editor…</div>`;
      return;
    }
    const vacuums = Object.entries(this._hass.states)
      .filter(([entityId]) => entityId.startsWith("vacuum."))
      .sort((a, b) =>
        String(a[1].attributes?.friendly_name || a[0]).localeCompare(
          String(b[1].attributes?.friendly_name || b[0]),
        ),
      );
    const maps = Object.entries(this._hass.states)
      .filter(([entityId]) => ["camera", "image"].includes(domainOf(entityId)))
      .sort((a, b) => a[0].localeCompare(b[0]));
    const sections = [
      ["overview", "Overview", "mdi:view-dashboard-outline"],
      ["controls", "Controls", "mdi:remote"],
      ["configuration", "Configuration", "mdi:cog-outline"],
      ["diagnostics", "Diagnostics", "mdi:chart-box-outline"],
    ];
    const deviceEntities = this._deviceEntities();
    const sceneSelectors = deviceEntities.filter((item) =>
      ["select", "input_select"].includes(item.domain),
    );
    const automaticScene = sceneSelectors.find((item) =>
      /scene.*task|task.*scene|scene\/task/i.test(`${item.id} ${item.label}`),
    );
    const activeSceneEntity = this._config.scene_entity || automaticScene?.id || "";
    const sceneOptions = this._hass.states[activeSceneEntity]?.attributes?.options || [];
    const startEntities = deviceEntities.filter((item) =>
      ["button", "script", "scene"].includes(item.domain),
    );
    const entities = this._sectionEntities(this._activeSection);
    const mode = this._config[`${this._activeSection}_entity_mode`] || "automatic";

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="editor">
        <section class="editor-section">
          <h3>Vacuum</h3>
          <label class="field"><span>Vacuum robot</span>
            <select data-field="entity">
              <option value="">Select a vacuum</option>
              ${vacuums
                .map(
                  ([entityId, state]) => `<option value="${escapeHtml(entityId)}" ${
                    this._config.entity === entityId ? "selected" : ""
                  }>${escapeHtml(state.attributes?.friendly_name || entityId)}</option>`,
                )
                .join("")}
            </select>
          </label>
          <label class="field"><span>Card title</span>
            <input data-field="title" value="${escapeHtml(this._config.title || "")}" placeholder="Use vacuum name">
          </label>
          <label class="field"><span>Map entity</span>
            <select data-field="map_entity">
              <option value="">Automatic</option>
              ${maps
                .map(
                  ([entityId, state]) => `<option value="${escapeHtml(entityId)}" ${
                    this._config.map_entity === entityId ? "selected" : ""
                  }>${escapeHtml(state.attributes?.friendly_name || entityId)}</option>`,
                )
                .join("")}
            </select>
          </label>
          <label class="field"><span>Extra scripts, scenes or controls</span>
            <textarea data-field="extra_entities" placeholder="One entity ID per line">${escapeHtml(
              (this._config.extra_entities || []).join("\n"),
            )}</textarea>
          </label>
        </section>

        <section class="editor-section scene-editor">
          <div class="scene-editor-heading">
            <h3>Scene quick buttons</h3>
            ${this._displayToggle("show_scene_buttons", "Show")}
          </div>
          <label class="field"><span>Scene/Task entity</span>
            <select data-field="scene_entity">
              <option value="">Automatic${automaticScene ? ` — ${escapeHtml(automaticScene.label)}` : ""}</option>
              ${sceneSelectors
                .map(
                  (item) => `<option value="${escapeHtml(item.id)}" ${
                    this._config.scene_entity === item.id ? "selected" : ""
                  }>${escapeHtml(item.label)} — ${escapeHtml(item.id)}</option>`,
                )
                .join("")}
            </select>
          </label>
          <label class="field"><span>Start cleaning action</span>
            <select data-field="scene_start_entity">
              <option value="">Automatic Start Cleaning button, otherwise vacuum.start</option>
              ${startEntities
                .map(
                  (item) => `<option value="${escapeHtml(item.id)}" ${
                    this._config.scene_start_entity === item.id ? "selected" : ""
                  }>${escapeHtml(item.label)} — ${escapeHtml(item.id)}</option>`,
                )
                .join("")}
            </select>
          </label>
          <div class="scene-button-list">
            ${(this._config.scene_buttons || [])
              .map((button, index) => this._sceneButtonEditor(button, index, sceneOptions))
              .join("")}
          </div>
          <button class="add-scene" data-add-scene><ha-icon icon="mdi:plus"></ha-icon>Add scene button</button>
        </section>

        <section class="editor-section display-editor">
          <h3>Display</h3>
          <label class="field default-tab-field"><span>Default tab</span>
            <select data-field="initial_tab">
              ${sections
                .map(
                  ([id, label]) => `<option value="${id}" ${
                    this._config.initial_tab === id ? "selected" : ""
                  }>${label}</option>`,
                )
                .join("")}
            </select>
          </label>
          <label class="field"><span>Vacuum information layout</span>
            <select data-field="overview_info_layout">
              <option value="list" ${this._config.overview_info_layout !== "grid" ? "selected" : ""}>List</option>
              <option value="grid" ${this._config.overview_info_layout === "grid" ? "selected" : ""}>Grid</option>
            </select>
          </label>
          <div class="display-grid">
            ${this._displayToggle("show_map", "Show map")}
            ${this._displayToggle("show_quick_controls", "Show quick controls")}
            ${this._displayToggle("show_overview", "Show Overview tab")}
            ${this._displayToggle("show_controls", "Show Controls tab")}
            ${this._displayToggle("show_configuration", "Show Configuration tab")}
            ${this._displayToggle("show_diagnostics", "Show Diagnostics tab")}
          </div>
        </section>

        <section class="editor-section entity-visibility">
          <h3>Entity visibility</h3>
          <nav class="editor-tabs">
            ${sections
              .map(
                ([id, label, icon]) => `<button data-section="${id}" class="${
                  this._activeSection === id ? "active" : ""
                }"><ha-icon icon="${icon}"></ha-icon><span>${label}</span></button>`,
              )
              .join("")}
          </nav>
          <label class="field mode-field"><span>Entities in this tab</span>
            <select data-section-mode="${this._activeSection}">
              <option value="automatic" ${mode === "automatic" ? "selected" : ""}>Automatic discovery</option>
              <option value="selected" ${mode === "selected" ? "selected" : ""}>Selected entities only</option>
            </select>
          </label>
          <p class="hint">Use the sliders to show or hide entities in ${titleCase(
            this._activeSection,
          )}. Drag enabled rows by the grip to change their dashboard order.</p>
          <div class="entity-list">
            ${entities
              .map((item) => this._entityToggleRow(this._activeSection, item))
              .join("")}
            ${entities.length ? "" : `<div class="empty-editor">No matching entities found.</div>`}
          </div>
        </section>
      </div>
    `;
    this._attachEvents();
    this._renderedSection = this._activeSection;
    this._restoreEditorScroll();
  }

  _displayToggle(name, label) {
    return `<label class="toggle-row"><span>${label}</span><span class="switch">
      <input type="checkbox" data-boolean-field="${name}" ${this._config[name] ? "checked" : ""}>
      <i></i>
    </span></label>`;
  }

  _sceneButtonEditor(button, index, options) {
    const currentOption = button.option || "";
    const allOptions = [...options];
    if (currentOption && !allOptions.includes(currentOption)) allOptions.push(currentOption);
    return `<div class="scene-button-editor">
      <div class="scene-button-number">${index + 1}</div>
      <label class="field"><span>Scene option</span>
        <select data-scene-index="${index}" data-scene-property="option">
          <option value="">Select a Scene/Task</option>
          ${allOptions
            .map(
              (option) => `<option value="${escapeHtml(option)}" ${
                currentOption === option ? "selected" : ""
              }>${escapeHtml(option)}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="field"><span>Button name</span>
        <input data-scene-index="${index}" data-scene-property="name" value="${escapeHtml(
          button.name || "",
        )}" placeholder="${escapeHtml(currentOption || `Scene ${index + 1}`)}">
      </label>
      <label class="field"><span>MDI icon</span>
        <input data-scene-index="${index}" data-scene-property="icon" value="${escapeHtml(
          button.icon || "mdi:play-circle-outline",
        )}" placeholder="mdi:home-floor-1">
      </label>
      <label class="field color-field"><span>Colour</span>
        <input type="color" data-scene-index="${index}" data-scene-property="color" value="${safeColor(
          button.color,
        )}">
      </label>
      <button class="delete-scene" data-delete-scene="${index}" title="Delete scene button"><ha-icon icon="mdi:delete-outline"></ha-icon></button>
    </div>`;
  }

  _entityToggleRow(section, item) {
    const visible = this._isVisible(section, item.id);
    const reorderable = visible && !item.virtual;
    const dragAttributes = reorderable
      ? `data-entity-row="${escapeHtml(item.id)}" data-row-section="${section}"`
      : "";
    const dragHandle = reorderable
      ? `<span class="entity-drag-handle" draggable="true" data-drag-entity="${escapeHtml(
          item.id,
        )}" data-drag-section="${section}" title="Drag to change position"><ha-icon icon="mdi:drag-vertical"></ha-icon></span>`
      : `<span class="entity-drag-placeholder"></span>`;
    return `<div class="entity-toggle-row" ${dragAttributes}>
      <label class="switch" title="Show or hide ${escapeHtml(item.label)}">
        <input type="checkbox" data-entity-visibility="${escapeHtml(item.id)}" data-section-name="${section}" ${
          visible ? "checked" : ""
        }>
        <i></i>
      </label>
      ${dragHandle}
      <ha-icon icon="${item.stateObj.attributes?.icon || "mdi:circle-small"}"></ha-icon>
      <span class="entity-name"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.id)}</small></span>
    </div>`;
  }

  _attachEvents() {
    this.shadowRoot.querySelectorAll("[data-section]").forEach((button) => {
      button.addEventListener("click", () => {
        this._activeSection = button.dataset.section;
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-field]").forEach((field) => {
      field.addEventListener("change", () => {
        let value = field.value;
        if (field.dataset.field === "extra_entities") {
          value = field.value
            .split(/[\n,]+/)
            .map((item) => item.trim())
            .filter(Boolean);
        }
        this._setField(field.dataset.field, value);
      });
    });
    this.shadowRoot.querySelectorAll("[data-boolean-field]").forEach((input) => {
      input.addEventListener("change", () => this._setField(input.dataset.booleanField, input.checked));
    });
    this.shadowRoot.querySelector("[data-section-mode]")?.addEventListener("change", (event) => {
      const section = event.target.dataset.sectionMode;
      this._setField(`${section}_entity_mode`, event.target.value);
    });
    this.shadowRoot.querySelectorAll("[data-entity-visibility]").forEach((input) => {
      input.addEventListener("change", () =>
        this._toggleEntity(input.dataset.sectionName, input.dataset.entityVisibility, input.checked),
      );
    });
    const clearDragStyles = () => {
      this.shadowRoot.querySelectorAll(".dragging, .drop-before, .drop-after").forEach((row) =>
        row.classList.remove("dragging", "drop-before", "drop-after"),
      );
    };
    this.shadowRoot.querySelectorAll("[data-drag-entity]").forEach((handle) => {
      handle.addEventListener("dragstart", (event) => {
        this._draggedEntity = {
          section: handle.dataset.dragSection,
          entityId: handle.dataset.dragEntity,
        };
        handle.closest(".entity-toggle-row")?.classList.add("dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", handle.dataset.dragEntity);
        }
      });
      handle.addEventListener("dragend", () => {
        this._draggedEntity = null;
        clearDragStyles();
      });
    });
    this.shadowRoot.querySelectorAll("[data-entity-row]").forEach((row) => {
      row.addEventListener("dragover", (event) => {
        if (!this._draggedEntity || this._draggedEntity.section !== row.dataset.rowSection) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        const bounds = row.getBoundingClientRect();
        const placeAfter = event.clientY > bounds.top + bounds.height / 2;
        row.classList.toggle("drop-before", !placeAfter);
        row.classList.toggle("drop-after", placeAfter);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-before", "drop-after"));
      row.addEventListener("drop", (event) => {
        if (!this._draggedEntity || this._draggedEntity.section !== row.dataset.rowSection) return;
        event.preventDefault();
        const bounds = row.getBoundingClientRect();
        const placeAfter = event.clientY > bounds.top + bounds.height / 2;
        const { section, entityId } = this._draggedEntity;
        this._draggedEntity = null;
        clearDragStyles();
        this._moveEntityTo(section, entityId, row.dataset.entityRow, placeAfter);
      });
    });
    this.shadowRoot.querySelector("[data-add-scene]")?.addEventListener("click", () => {
      const selectors = this._deviceEntities().filter((item) =>
        ["select", "input_select"].includes(item.domain),
      );
      const automatic = selectors.find((item) =>
        /scene.*task|task.*scene|scene\/task/i.test(`${item.id} ${item.label}`),
      );
      const entityId = this._config.scene_entity || automatic?.id;
      const option = this._hass.states[entityId]?.attributes?.options?.[0] || "";
      this._config = {
        ...this._config,
        scene_buttons: [
          ...(this._config.scene_buttons || []),
          {
            option,
            name: option,
            icon: "mdi:play-circle-outline",
            color: "#b58cff",
          },
        ],
      };
      this._emitConfig();
      this._render();
    });
    this.shadowRoot.querySelectorAll("[data-delete-scene]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.deleteScene);
        const sceneButtons = (this._config.scene_buttons || []).filter((_, itemIndex) => itemIndex !== index);
        this._config = { ...this._config, scene_buttons: sceneButtons };
        this._emitConfig();
        this._render();
      });
    });
    this.shadowRoot.querySelectorAll("[data-scene-property]").forEach((field) => {
      field.addEventListener("change", () => {
        const index = Number(field.dataset.sceneIndex);
        const property = field.dataset.sceneProperty;
        const sceneButtons = (this._config.scene_buttons || []).map((button, itemIndex) => {
          if (itemIndex !== index) return button;
          const updated = { ...button, [property]: field.value };
          if (property === "option" && !button.name) updated.name = field.value;
          return updated;
        });
        this._config = { ...this._config, scene_buttons: sceneButtons };
        this._emitConfig();
        this._render();
      });
    });
  }

  _styles() {
    return `
      :host { display: block; width: 100%; max-width: 100%; min-width: 0; overflow-x: hidden; contain: inline-size; container-type: inline-size; --editor-accent: var(--primary-color, #b58cff); }
      * { box-sizing: border-box; }
      .editor { width: 100%; max-width: 100%; min-width: 0; display: grid; gap: 14px; overflow-x: hidden; color: var(--primary-text-color); }
      .editor-section { width: 100%; max-width: 100%; min-width: 0; padding: 14px; overflow: hidden; border: 1px solid var(--divider-color); border-radius: 14px; background: var(--card-background-color); }
      .editor-section > * { max-width: 100%; min-width: 0; }
      h3 { margin: 0 0 12px; font-size: 16px; }
      .field { display: grid; gap: 5px; margin-top: 11px; color: var(--secondary-text-color); font-size: 12px; }
      .field:first-of-type { margin-top: 0; }
      select, input, textarea { width: 100%; max-width: 100%; min-width: 0; border: 1px solid var(--divider-color); border-radius: 9px; padding: 10px; color: var(--primary-text-color); background: var(--secondary-background-color); font: inherit; }
      textarea { min-height: 68px; resize: vertical; }
      .display-grid { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 14px; }
      .default-tab-field { grid-template-columns: minmax(0, 1fr) minmax(0, 48%); align-items: center; margin-bottom: 8px; }
      .scene-editor-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .scene-editor-heading h3 { margin-bottom: 0; }
      .scene-editor-heading .toggle-row { gap: 7px; }
      .scene-button-list { display: grid; gap: 9px; margin-top: 12px; }
      .scene-button-editor { position: relative; width: 100%; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; align-items: end; padding: 11px 9px 9px 36px; overflow: hidden; border: 1px solid var(--divider-color); border-radius: 12px; background: var(--secondary-background-color); }
      .scene-button-editor .field { margin-top: 0; }
      .scene-button-editor .field:first-of-type { grid-column: auto; }
      .scene-button-number { position: absolute; left: 11px; top: 19px; width: 19px; height: 19px; display: grid; place-items: center; border-radius: 50%; color: var(--editor-accent); background: color-mix(in srgb, var(--editor-accent) 18%, transparent); font-size: 10px; font-weight: 700; }
      .color-field input { min-height: 39px; padding: 4px; cursor: pointer; }
      .delete-scene { width: 39px; height: 39px; border: 0; border-radius: 9px; color: var(--error-color); background: color-mix(in srgb, var(--error-color) 10%, transparent); cursor: pointer; }
      .add-scene { margin-top: 10px; padding: 9px 12px; border: 1px dashed var(--editor-accent); border-radius: 9px; display: flex; align-items: center; gap: 6px; color: var(--editor-accent); background: transparent; cursor: pointer; }
      .add-scene ha-icon, .delete-scene ha-icon { --mdc-icon-size: 19px; }
      .toggle-row, .entity-toggle-row { display: flex; align-items: center; gap: 10px; }
      .toggle-row { min-height: 42px; }
      .toggle-row > span:first-child { min-width: 0; flex: 1; font-size: 12px; }
      .switch { position: relative; flex: 0 0 auto; width: 42px; height: 24px; }
      .switch input { position: absolute; opacity: 0; pointer-events: none; }
      .switch i { display: block; width: 42px; height: 24px; padding: 3px; border: 1px solid var(--divider-color); border-radius: 999px; background: var(--secondary-background-color); cursor: pointer; }
      .switch i::after { content: ""; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--disabled-text-color); transition: transform .15s ease, background .15s ease; }
      .switch input:checked + i { background: color-mix(in srgb, var(--editor-accent) 40%, var(--secondary-background-color)); }
      .switch input:checked + i::after { transform: translateX(17px); background: var(--editor-accent); }
      .editor-tabs { width: 100%; min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; overflow: hidden; padding: 4px; border-radius: 11px; background: var(--secondary-background-color); }
      .editor-tabs button { min-width: 0; padding: 9px 5px; border: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 5px; color: var(--secondary-text-color); background: transparent; cursor: pointer; }
      .editor-tabs button.active { color: var(--primary-text-color); background: color-mix(in srgb, var(--editor-accent) 24%, var(--card-background-color)); }
      .editor-tabs ha-icon { --mdc-icon-size: 17px; }
      .editor-tabs span { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
      .mode-field { grid-template-columns: minmax(0, 1fr) minmax(0, 48%); align-items: center; }
      .hint { margin: 10px 0 7px; color: var(--secondary-text-color); font-size: 11px; }
      .entity-list { width: 100%; min-width: 0; max-height: 430px; overflow-x: hidden; overflow-y: auto; padding: 0 3px; scrollbar-width: thin; }
      .entity-toggle-row { min-height: 54px; border-top: 1px solid var(--divider-color); }
      .entity-toggle-row:first-child { border-top: 0; }
      .entity-toggle-row.dragging { opacity: .42; }
      .entity-toggle-row.drop-before { box-shadow: inset 0 2px 0 var(--editor-accent); }
      .entity-toggle-row.drop-after { box-shadow: inset 0 -2px 0 var(--editor-accent); }
      .entity-toggle-row > ha-icon { color: var(--editor-accent); --mdc-icon-size: 19px; }
      .entity-drag-handle, .entity-drag-placeholder { flex: 0 0 24px; width: 24px; height: 32px; }
      .entity-drag-handle { display: grid; place-items: center; color: var(--secondary-text-color); cursor: grab; user-select: none; }
      .entity-drag-handle:active { cursor: grabbing; }
      .entity-drag-handle ha-icon { pointer-events: none; --mdc-icon-size: 20px; }
      .entity-name { min-width: 0; flex: 1; }
      .entity-name strong, .entity-name small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .entity-name strong { font-size: 12px; }
      .entity-name small { margin-top: 2px; color: var(--secondary-text-color); font-size: 9px; }
      .empty-editor { padding: 18px; color: var(--secondary-text-color); text-align: center; font-size: 12px; }
      @container (max-width: 430px) {
        .display-grid { grid-template-columns: 1fr; }
        .default-tab-field, .mode-field { grid-template-columns: 1fr; gap: 5px; }
        .editor-tabs span { display: none; }
        .editor-tabs ha-icon { --mdc-icon-size: 20px; }
      }
      .scene-button-editor .delete-scene { justify-self: end; }
    `;
  }
}

if (!customElements.get("vacuum-robot-menu-card")) {
  customElements.define("vacuum-robot-menu-card", VacuumRobotMenuCard);
}

if (!customElements.get("vacuum-robot-menu-card-editor")) {
  customElements.define("vacuum-robot-menu-card-editor", VacuumRobotMenuCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "vacuum-robot-menu-card")) {
  window.customCards.push({
    type: "vacuum-robot-menu-card",
    name: "Eufy Vacuum Card",
    description: "Unified status, controls, configuration, map and diagnostics for a vacuum robot",
    preview: true,
  });
}

console.info(
  `%c VACUUM-ROBOT-MENU-CARD %c v${CARD_VERSION} `,
  "color:white;background:#8d65d6;font-weight:700;padding:2px 5px;border-radius:4px 0 0 4px;",
  "color:#8d65d6;background:#f0e9ff;font-weight:700;padding:2px 5px;border-radius:0 4px 4px 0;",
);
