# Eufy Vacuum Card

A standalone Home Assistant dashboard card that combines a vacuum robot's status,
commands, map, controls, configuration, sensors, and diagnostics into one compact
tabbed card.

The card automatically finds entities belonging to the same Home Assistant device
as the selected `vacuum` entity. No HACS frontend dependency is required.

Developed and tested with the **Eufy Robot Vacuum Omni E28** through Home
Assistant. Other vacuum models can also work when their integration exposes
standard Home Assistant vacuum services and related device entities.

## Features

- robot name and live status;
- active cleaning target shown beside the Cleaning status when available;
- battery, water level, and dock status summary;
- Start/Pause, Stop, Return Home, and Locate buttons;
- configurable one-touch Scene/Task buttons with custom names, MDI icons, and colors;
- optional live map from an `image` or `camera` entity;
- Overview, Controls, Configuration, and Diagnostics tabs;
- automatic controls for `button`, `select`, `switch`, `number`, and `time` entities;
- standard vacuum fan/suction level control when the integration provides it;
- optional extra scripts and scenes for routines such as Full House Clean;
- individual show/hide sliders for every entity in every tab;
- drag-and-drop entity ordering in both discovery modes;
- independent Overview and Controls visibility for the vacuum suction level;
- automatic or manually selected entities for every tab;
- visual card editor with switches for every section;
- responsive desktop and mobile layout.

## HACS installation

1. Open **HACS** in Home Assistant.
2. Select **Dashboard**.
3. Open the three-dot menu and choose **Custom repositories**.
4. Add:

   ```text
   https://github.com/akugiz/eufy-vacuum-card
   ```

5. Select **Dashboard** as the category.
6. Add the repository, then download **Eufy Vacuum Card**.
7. Refresh Home Assistant.

## Manual installation

1. Extract the downloaded ZIP file.
2. Open Home Assistant's **File editor** or **Studio Code Server**.
3. Copy `vacuum-robot-menu-card.js` to:

   ```text
   /config/www/vacuum-robot-menu-card.js
   ```

4. If the `www` folder did not already exist, restart Home Assistant.
5. Go to **Settings → Dashboards**.
6. Open the three-dot menu and select **Resources**.
7. Add this JavaScript module:

   ```text
   /local/vacuum-robot-menu-card.js?v=160
   ```

8. Refresh the browser or fully close and reopen the Home Assistant mobile app.

## Add the card

1. Edit a dashboard and select **Add card**.
2. Find **Eufy Vacuum Card**.
3. Select the vacuum entity, for example `vacuum.eufy_e28`.
4. Save the card.

Minimum YAML:

```yaml
type: custom:vacuum-robot-menu-card
entity: vacuum.eufy_e28
```

## Full example

```yaml
type: custom:vacuum-robot-menu-card
entity: vacuum.eufy_e28
title: Eufy E28

# Optional if the map is not discovered automatically
map_entity: image.eufy_e28_map

# Optional dashboard scripts or scenes that are not part of the vacuum device
extra_entities:
  - script.full_house_clean_max
  - script.clean_after_cooking

# Optional one-touch Scene/Task buttons below the main controls
show_scene_buttons: true
scene_entity: select.eufy_e28_scene_task
scene_start_entity: button.eufy_e28_start_cleaning
scene_buttons:
  - option: "Main (ID: 7)"
    name: Main Floor
    icon: mdi:home-floor-1
    color: "#ff8800"
  - option: "Kitchen (ID: 9)"
    name: Kitchen
    icon: mdi:pot-steam-outline
    color: "#ef6c9f"

# Use automatic discovery or choose exactly what appears in each tab
overview_entity_mode: automatic
controls_entity_mode: selected
controls_entities:
  - select.eufy_e28_suction_level
  - button.eufy_e28_empty_dust_bin
  - script.full_house_clean_max
configuration_entity_mode: automatic
diagnostics_entity_mode: automatic

initial_tab: overview
show_map: true
show_quick_controls: true
show_overview: true
show_controls: true
show_configuration: true
show_diagnostics: true
```

## Scene/Task quick buttons

Open the card's visual editor and use **Scene quick buttons**. Select the vacuum's
Scene/Task entity and the Start Cleaning action, then add as many buttons as you
need. For each button, choose the Scene/Task option and set its displayed name,
MDI icon, and color.

When pressed, a quick button first selects its configured Scene/Task option and
then starts cleaning. The card can automatically discover a Scene/Task selector
and a Start Cleaning button on the same device. If it cannot find a separate
start action, it uses `vacuum.start`.

## Choose entities for each tab

The custom visual editor has matching **Overview**, **Controls**, **Configuration**,
and **Diagnostics** tabs. Open a tab and use the slider beside every entity to
show or hide it. The choice applies only to that tab, so a sensor can be hidden
from Overview while remaining visible in Diagnostics.

Each tab also offers two modes:

- **Automatic discovery** groups compatible vacuum-device entities for you.
- **Selected entities only** displays exactly the entities selected in that section.

In **Selected entities only** mode, all available vacuum-device entities are listed
with individual sliders, allowing entities to be placed in a different tab. An
entity selected manually for one tab is removed from automatically generated lists
in the other tabs. In either mode, drag a row by its grip handle to change the
dashboard order. The built-in vacuum Suction level appears as its own visibility
row in Overview and Controls. The Display switches can still hide an entire tab.

## How automatic discovery works

The card reads Home Assistant's entity registry and includes enabled entities that
belong to the selected vacuum's device. It groups them automatically:

- sensors and binary sensors appear in **Diagnostics**;
- cleaning buttons, room/task selectors, suction controls, scripts, and scenes
  appear in **Controls**;
- switches, cleaning modes, timers, numbers, and reset buttons appear in
  **Configuration**;
- image or camera entities containing `map` are used in **Overview**.

If an entity is on a separate device or is a dashboard script, add it under
**Extra scripts, scenes or controls** in the visual card editor.

## Vacuum commands

The quick buttons use Home Assistant's standard services:

- `vacuum.start`
- `vacuum.pause`
- `vacuum.stop`
- `vacuum.return_to_base`
- `vacuum.locate`

Availability depends on the features supported by the vacuum integration. If a
command is unsupported, Home Assistant will report the error inside the card.

The card remembers the scroll position of each tab while Home Assistant updates
live entity states. It pauses redraws while you are actively scrolling and restores
the position after browser layout finishes, so long Configuration and Diagnostics
lists do not jump back to the top.

## Privacy

The card makes no internet requests. It communicates only with the Home Assistant
instance where it is installed.
