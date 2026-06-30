//tighe uses weird coordinate reference system
//probably just dont touch this
var customCRS = new L.Proj.CRS('EPSG:3857',
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs',
    {
        origin: [-20037700, 30241100],
        resolutions: [
            25.400050800101603, //zoom 0
            19.0500381000762,   //zoom 1
            12.700025400050801, //zoom 2
            6.350012700025401,  //zoom 3
            3.1750063500127004, //zoom 4
            1.5875031750063502, //zoom 5
            0.63500127000254,   //zoom 6
            0.31750063500127,   //zoom 7
            0.158750317500635,  //zoom 8
            0.0793751587503175, //zoom 9
            0.06350012700025401 //zoom 10
        ]
    }
);

//hack of the century
//defeated my arch nemesis
//without this weird panning effects happen when clicking geoman near the corners
L.Marker.include({
    _panOnFocus: function () {}
});

//initalizing map with CRS
var map = L.map('map', {
    rotate: true, bearing: 10, rotateControl: false,
    crs: customCRS,
    minZoom: 6,
    maxZoom: 10,
    // maxBounds: [
    //     [41.15865422796046, -73.52978700130929], 
    //     [41.159501876187804, -73.53413260380269]
    // ],
    autoPanPadding: [0, 0],
});


L.tileLayer('https://hostingdata3.tighebond.com/arcgis/rest/services/NewCanaanCT/NewCanaanBasemapPlanimetric/MapServer/tile/{z}/{y}/{x}', {
    attribution: '&copy; Tighe & Bond',
    continuousWorld: true
}).addTo(map);

map.setView([41.14686914854269, -73.49342001509295], 7);

//layer controls
let mapLayers = [];
let selectedLayerID = null;

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

//adds to map and mapLayers
function createLayerRecord(name, color, existingFeatureGroup = null, isLocked = false) {
    const id = 'layer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const fg = existingFeatureGroup || L.featureGroup().addTo(map);

    const newLayer = {id, name, color, featureGroup : fg, isLocked};
    mapLayers.push(newLayer);

    renderLayers(); //actually changes dom
    return newLayer;
}

//defaults
const buildingColor = '#2a63aa';
const drawingColor = '#c325d5';
const unselectedOpacity = 0.5;
const selectedOpacity = 0.8

let customShapeStyling = {
    color: '#c325d5',
    fillColor: '#c325d5',
    fillOpacity: unselectedOpacity,
    weight: 2,
};

//jank we'll need later
let needUpdateGhost = false;

function selectLayer(id) {
    selectedLayerID = id;
    const activeLayer = mapLayers.find(l => (l.id === id));

    if (activeLayer) {
        //changing drawing colors
        map.pm.setPathOptions({
            color: activeLayer.color,
            fillColor: activeLayer.color,
            fillOpacity: unselectedOpacity
        });
        customShapeStyling.color = activeLayer.color;
        customShapeStyling.fillColor = activeLayer.color;
        needUpdateGhost = true;
        map.pm.setGlobalOptions({
            templineStyle: {
                color: activeLayer.color
            },
            hintlineStyle: {
                color: activeLayer.color,
                dashArray: [5, 5]
            },
            markerStyle: {
                icon: getColoredMarkerIcon(activeLayer.color)
            }
        });
    }
    renderLayers();
}

function deleteLayer(id) {
    const idx = mapLayers.findIndex(l => (l.id === id)); 
    if (idx === -1 || mapLayers[idx].isLocked) {return;}

    mapLayers[idx].featureGroup.getLayers().forEach(layer => {
        if (layer.labelMarker) { //same as in updatelabel
            map.removeLayer(layer.labelMarker);
            const idx = labelMarkers.indexOf(layer.labelMarker);
            if (idx !== -1) {
                labelMarkers.splice(idx, 1);
            }
            layer.labelMarker = null;
        }
    });

    map.removeLayer(mapLayers[idx].featureGroup);
    mapLayers.splice(idx, 1); //why is it called that in js

    //what if selected layer gets deleted
    if (selectedLayerID === id) {
        const fallbackLayer = mapLayers.find(l => !l.isLocked);
        if (fallbackLayer) {
            selectLayer(fallbackLayer.id)
        } else {
            //create new one
            const newID = createLayerRecord('Custom Layer', getRandomColor()).id;
            selectLayer(newID)
        }
    }
    renderLayers();
}

function renderLayers() {
    const layerPanel = document.getElementById('layer-panel');
    
    layerPanel.innerHTML = '';

    mapLayers.forEach(lyr => {
        const layerEl = document.createElement('div');
        layerEl.className = `layer ${selectedLayerID === lyr.id ? 'selected' : ''} ${lyr.isLocked ? 'locked' : ''}`;
        layerEl.style.setProperty('--layer-color', lyr.color);

        layerEl.innerHTML = `
            <div class="layer-subsection">
                <div class="layer-icon"></div>
                <div class="layer-name">${lyr.name}</div>
            </div>
            <div class="layer-subsection">
                ${lyr.isLocked ? '<span class="lock-icon">&#x1F512;&#xFE0E;</span>' : ''}
                <button class="layer-button">
                    <div class="button-icon">&hellip;</div>
                </button>
                <div class="layer-dropdown hidden">
                    <div class="dropdown-item rename-opt">Rename</div>
                    <div class="dropdown-item export-opt">Export GeoJSON</div>
                    ${!lyr.isLocked ? '<div class="dropdown-item delete-opt">Delete</div>' : '<div class="dropdown-item import-opt">Import GeoJSON</div>'}
                </div>
            </div>
        `;

        //select trigger
        layerEl.addEventListener('click', (e) => {
            if (e.target.closest('.layer-button')) {return;}
            if (lyr.isLocked) {return;}
            selectLayer(lyr.id);
        });

        //dropdown
        const toggleBtn = layerEl.querySelector('.layer-button');
        const dropdownMenu = layerEl.querySelector('.layer-dropdown');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.layer-dropdown').forEach(d => {
                //hide everything that isnt the selected
                if (d !== dropdownMenu) {d.classList.add('hidden');}
            });
            //toggle the selected
            dropdownMenu.classList.toggle('hidden');
            
            //put it in place
            if (!dropdownMenu.classList.contains('hidden')) {
                const rect = toggleBtn.getBoundingClientRect();
                dropdownMenu.style.top = `${rect.bottom}px`;
                dropdownMenu.style.left = `${rect.right - dropdownMenu.offsetWidth}px`;
            }
        });

        //add new functionality here
        layerEl.querySelector('.rename-opt').addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.add('hidden');
            //make this better later
            const userResponse = prompt(`Rename layer "${lyr.name}" to:`, lyr.name);
            if (userResponse && userResponse.trim() !== '') {
                lyr.name = userResponse.trim();
                renderLayers();
            }
        });
        layerEl.querySelector('.export-opt').addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.add('hidden');
            exportLayer(lyr.id);
        });
        
        //may not exist so gotta create conditional
        const deleteOpt = layerEl.querySelector('.delete-opt');
        if (deleteOpt) {
            layerEl.querySelector('.delete-opt').addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.classList.add('hidden');
                //also this
                if (confirm(`Are you sure you want to delete "${lyr.name}"? This will remove all elements inside.`)) {
                    deleteLayer(lyr.id);
                }
            });
        }
        const importOpt = layerEl.querySelector('.import-opt');
        if (importOpt) {
            layerEl.querySelector('.import-opt').addEventListener('click', (e) => {
                e.stopPropagation();
                dropdownMenu.classList.add('hidden');
                document.getElementById('file-import-business').click();
            });
        }

        layerPanel.appendChild(layerEl);
    })
}

//export code
function exportLayer(id) {
    saveNotesField();

    const layer = mapLayers.find(l => (l.id === id));
    if (!layer) {return};

    const geojson = layer.featureGroup.toGeoJSON(20);
    geojson.layerName = layer.name;
    geojson.layerColor = layer.color;

    //dont ask me about this part
    const blob = new Blob([JSON.stringify(geojson)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `${layer.name || "layer"}.geojson`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
}

//import code
const layerAddBtn = document.getElementById('layer-add');
const addLayerDropdown = document.getElementById('add-layer-dropdown');

layerAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    //this again
    document.querySelectorAll('.layer-dropdown').forEach(d => {
        if (d !== addLayerDropdown) {
            d.classList.add('hidden');
        }
    });
    addLayerDropdown.classList.toggle('hidden');

    if (!addLayerDropdown.classList.contains('hidden')) {
        const rect = layerAddBtn.getBoundingClientRect();
        addLayerDropdown.style.top = `${rect.bottom}px`;
        addLayerDropdown.style.left = `${rect.right - addLayerDropdown.offsetWidth}px`;
    }
});

//binds
document.getElementById('opt-new-layer').addEventListener('click', (e) => {
    e.stopPropagation();
    addLayerDropdown.classList.add('hidden');
    createLayerRecord('Custom Layer', getRandomColor());
});
document.getElementById('opt-import-business').addEventListener('click', (e) => {
    e.stopPropagation();
    addLayerDropdown.classList.add('hidden');
    document.getElementById('file-import-business').click();
});
document.getElementById('opt-import-drawing').addEventListener('click', (e) => {
    e.stopPropagation();
    addLayerDropdown.classList.add('hidden');
    document.getElementById('file-import-drawing').click();
});

document.getElementById('file-import-business').addEventListener('change', e => {
    handleImportFile(e, 'business')
});
document.getElementById('file-import-drawing').addEventListener('change', e => {
    handleImportFile(e, 'drawing')
});

function handleImportFile(event, type) {
    const file = event.target.files[0];
    if (!file) {return;}

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const geojson = JSON.parse(evt.target.result);
            if (type === 'business') {
                importBusinessGeoJSON(geojson);
            } else {
                importDrawingGeoJSON(geojson);
            }
        } catch (err) {
            console.error(err);
            alert("Invalid GeoJSON file.");
        }
        event.target.value = ''; //reset input
    };
    reader.readAsText(file);
}

function importBusinessGeoJSON(geojson) {
    //clear out labels from map/array
    businessGroup.getLayers().forEach(layer => {
        if (layer.labelMarker) { //same as in updatelabel
            map.removeLayer(layer.labelMarker);
            const idx = labelMarkers.indexOf(layer.labelMarker);
            if (idx !== -1) {
                labelMarkers.splice(idx, 1);
            }
            layer.labelMarker = null;
        }
    });

    businessGroup.clearLayers();

    L.geoJSON(geojson, {
        style: function(feature) {
            return {
                fillColor: buildingColor,
                color: buildingColor,
                weight: 2,
                fillOpacity: unselectedOpacity
            };
        },

        onEachFeature: function(feature, layer) {
            layer.options.pmIgnore = true; //disable editing base polygons
            bindShapeEvents(layer, feature);
            //label code
            createLabelMarker(feature, layer);

            layer.addTo(businessGroup);
        }
    });

    updateLabelSizes();
}

function importDrawingGeoJSON(geojson) {
    const name = geojson.layerName || 'Imported Layer';
    const color = geojson.layerColor || getRandomColor();

    const newLayerObj = createLayerRecord(name, color);

    L.geoJSON(geojson, {
        style: function(feature) {
            return {
                fillColor: color,
                color: color,
                weight: 2,
                fillOpacity: unselectedOpacity
            };
        },
        pointToLayer: function(feature, latlng) {
            return L.marker(latlng, {
                icon: getColoredMarkerIcon(color, true)
            });
        },
        onEachFeature: function(feature, layer) {
            layer.options.pmIgnore = false;
            bindShapeEvents(layer, feature);
            if (feature.properties.Label) {
                createLabelMarker(feature, layer);
            } else if (typeof layer.bindTooltip === 'function' && feature.properties?.Name) {
                // layer.bindTooltip(feature.properties.Name, {direction: 'top'});
            }
            layer.addTo(newLayerObj.featureGroup);
        }
    })
    updateLabelSizes();
    selectLayer(newLayerObj.id);
}



//add listener to close all dropdowns
document.addEventListener('click', () => {
    document.querySelectorAll('.layer-dropdown').forEach(d => d.classList.add('hidden'));
});
document.getElementById('layer-panel').addEventListener('scroll', () => {
    document.querySelectorAll('.layer-dropdown').forEach(d => d.classList.add('hidden'));
});





//default groups
const businessGroup = L.featureGroup().addTo(map);
createLayerRecord('Businesses', '#2a63aa', businessGroup, true);

const drawnItemsGroup = L.featureGroup().addTo(map);
selectLayer(createLayerRecord('Custom Layer', '#c325d5', drawnItemsGroup).id);

/////code de label
function createLabelMarker(feature, layer) {
    if (layer.labelMarker) {
        map.removeLayer(layer.labelMarker);
        const idx = labelMarkers.indexOf(layer.labelMarker);
        if (idx !== -1) {
            labelMarkers.splice(idx, 1);
        }
        layer.labelMarker = null;
    }

    if (!feature || !feature.properties) {return;}

    let labelCenter = null;
    if (feature.properties.labelOriginNum !== null && feature.properties.labelOriginNum !== undefined && typeof layer.getBounds === 'function') {
        //hack!!!
        const latlngs = layer.getLatLngs()[0];
        const firstCoord = latlngs[feature.properties.labelOriginNum % latlngs.length];
        const secondCoord = latlngs[(feature.properties.labelOriginNum + 1) % latlngs.length];
        const actualCenter = layer.getBounds().getCenter();
        labelCenter = {
            lat: (2*firstCoord.lat + 2*secondCoord.lat + actualCenter.lat) / 5,
            lng: (2*firstCoord.lng + 2*secondCoord.lng + actualCenter.lng) / 5
        }
        // labelCenter = {
        //     lat: (firstCoord.lat + secondCoord.lat) / 2,
        //     lng: (firstCoord.lng + secondCoord.lng) / 2
        // }
    } else {
        labelCenter = getLayerCenter(layer);
    }
    
    const labelSize = feature.properties.LabelSize ?? 7;
    const labelRotation = feature.properties.LabelRotation ?? 0;
    const labelText = (feature.properties.Label ?? '').replace(/\\n|\n/g, '<br>');
    
    let labelAdjust = '';
    if (feature.properties.AdjustX || feature.properties.AdjustY) {
        labelAdjust = `style="transform: translate(
            ${feature.properties.AdjustX ?? 0}%,
            ${feature.properties.AdjustY ?? 0}%)"`;
    }

    const label = L.divIcon({
        className: '', //must do this for unknown reasons
        html:
            `<div class="map-label-outer" 
                style="transform: translate(-50%, -50%);">
                <div class="map-label"
                    data-base-font-size="${labelSize}"
                    style="transform: rotate(${labelRotation}deg);">
                    <div class="map-label-adjust ${(feature.properties.labelBackground && labelText) ? 'map-label-background' : ''}" ${labelAdjust}>
                        ${labelText}
                    </div>
                </div>
            </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
    });

    const marker = L.marker(labelCenter, {
        icon: label,
        interactive: false,
        keyboard: false
    }).addTo(map);

    marker.options.pmIgnore = true;
    //link to list of all markers and to layer
    layer.labelMarker = marker;
    labelMarkers.push(marker);
}

//default event package
function bindShapeEvents(layer, feature) {
    //hover code
    layer.on('mouseover', () => {
        if (selectedPolygon !== layer && layer.setStyle) {
            layer.setStyle({fillOpacity: selectedOpacity})
        }
    });
    layer.on('mouseout', () => {
        if (selectedPolygon !== layer && layer.setStyle) {
            layer.setStyle({fillOpacity: unselectedOpacity})
        }
    });
    
    //panel code
    layer.on('click', (e) => {
        //check if geoman tools are active
        if (!enableLayerClick || map.pm.globalDrawModeEnabled() || map.pm.globalRemovalModeEnabled() || map.pm.globalEditModeEnabled() || map.pm.globalDragModeEnabled()) {
            return; //do nothing
        }
        L.DomEvent.stopPropagation(e);
        openInfoPanel(feature.properties, layer); //defined later
    });

    //labels!!!
    layer.on('pm:markerdragend', (e) => {
        if (layer.labelMarker) {
            createLabelMarker(layer.feature, layer);
            updateLabelSize(layer.labelMarker);
        }
    });
    layer.on('pm:dragend', (e) => {
        if (layer.labelMarker) {
            createLabelMarker(layer.feature, layer);
            updateLabelSize(layer.labelMarker);
        }
    });

    layer.on('pm:remove', (e) => {
        if (layer.labelMarker) {
            map.removeLayer(layer.labelMarker);
            const idx = labelMarkers.indexOf(layer.labelMarker);
            if (idx !== -1) {
                labelMarkers.splice(idx, 1);
            }
            layer.labelMarker = null;
        }
    });
}


let selectedPolygon = null;
let labelMarkers = [];

let enableLayerClick = true;

//finish label code
//helper function that gets list of all .map-labels
function getLabelElements() {
    return labelMarkers
        //map applys the arrow function to each labelMarker
        //'?' means only apply second function if non-null
        .map(m => m.getElement()?.querySelector('.map-label'))
        .filter(Boolean); //removes all false (null)
}

function getLabelElement(labelMarker) {
    return labelMarker.getElement()?.querySelector('.map-label');
}

const mapScales = [96000, 72000, 48000, 24000, 12000, 6000, 2400, 1200, 600, 300, 240];
const baseZoom = 6; 

function updateLabelSizes() {
    const currentZoom = Math.round(map.getZoom());
    const scale = mapScales[baseZoom] / mapScales[currentZoom];

    getLabelElements().forEach(el => {
        const baseSize = parseFloat(el.dataset.baseFontSize) //wtf is this language
        if (!isNaN(baseSize)) {
            el.style.fontSize = (baseSize * scale) + 'px';
        }
    });
}

function updateLabelSize(labelMarker) {
    if (!labelMarker) {
        return;
    }
    const currentZoom = Math.round(map.getZoom());
    const scale = mapScales[baseZoom] / mapScales[currentZoom];
    const el = getLabelElement(labelMarker);

    const baseSize = parseFloat(el.dataset.baseFontSize) //wtf is this language
    if (!isNaN(baseSize)) {
        el.style.fontSize = (baseSize * scale) + 'px';
    }
}

//using data.js
importBusinessGeoJSON(initGeoData);


//redo sizing on zooms
map.on('zoomstart', () => {
    getLabelElements().forEach(el => {
        el.style.visibility = 'hidden'; //disappears instantly
        el.style.opacity = '0';
    });
});
map.on('zoomend', () => {
    if (map.getZoom() < 6) {return;} //never fade back in if far enough away
    updateLabelSizes();
    getLabelElements().forEach(el => {
        el.style.visibility = 'visible';
        el.style.opacity = '1'; //reappears slowly
    });
});



///click time!
//panel setup 
const infoPanel = document.getElementById("info-panel");
const infoPanelCategory = infoPanel.querySelector('.category-badge');
const infoPanelName = infoPanel.querySelector('h1');
const infoPanelAddress = infoPanel.querySelector('h2');
const infoPanelBody = infoPanel.querySelector('.panel-body');

let notesTimeout = null;
const notesText = document.querySelector('.notes-placeholder');

function openInfoPanel(properties, layer) {
    //check if something else is already selected
    if (selectedPolygon && selectedPolygon !== layer) {
        clearSelection();
    } selectedPolygon = layer;

    //header section
    infoPanelName.textContent = properties.Name ?? 'Undefined';
    infoPanelAddress.textContent = properties.Address ?? 'Undefined';
    infoPanelCategory.textContent = properties.Category ?? 'Undefined';

    //body section
    //clear fields
    infoPanelBody.replaceChildren();

    if ('Phone' in properties && properties['Phone']) {
        createInfoPanelField('Phone', properties['Phone']);
    }
    if ('Website' in properties && properties['Website']) {
        const displayURL = tldts.getDomain(properties['Website']) || properties['Website'];
        createInfoPanelField('Website', displayURL, properties['Website']);
    }
    if ('Instagram' in properties && properties['Instagram']) {
        const instaURL = `https://www.instagram.com/${properties['Instagram'].replace(/^@/, '')}`;;
        createInfoPanelField('Instagram', properties['Instagram'], instaURL);
    }
    if ('Dimensions' in properties && properties['Dimensions']) {
        createInfoPanelField('Dimensions', properties['Dimensions']);
    }

    //notes section
    notesText.value = properties.Notes || '';

    infoPanel.classList.add('open');
}


const svgLookup = {
    'Email' : '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline>',
    'Phone' : '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>',
    'Owner' : '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
    'Website' : '<circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>',
    'Instagram': '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>',
    'Dimensions': '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    'default' : '<circle cx="12" cy="12" r="10"></circle>'
};
function createInfoPanelField(key, value, href = null) {
    const svgPath = svgLookup[key] ?? svgLookup['default'];

    const fieldDiv = document.createElement('div');
    fieldDiv.classList.add('field');
    //safe to use innerHTML bc svglookup is safe
    fieldDiv.innerHTML = `
        <svg class="field-icon" viewBox="0 0 24 24">
            ${svgPath}
        </svg>
        <div class="field-key"></div>
        <div class="field-value"></div>
    `;

    fieldDiv.querySelector('.field-key').textContent = key;

    if (href) {
        //create link and put inside .field-value div
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = value;
        fieldDiv.querySelector('.field-value').appendChild(link)
    } else {
        fieldDiv.querySelector('.field-value').textContent = value;
    }

    infoPanelBody.appendChild(fieldDiv);
}

function closeInfoPanel() {
    clearSelection();
    infoPanel.classList.remove('open');
}

function clearSelection() {
    if (selectedPolygon) {
        //before getting overridden
        saveNotesField();
        clearTimeout(notesTimeout); //dont know if i actually have to this

        //revert style to normal
        if (selectedPolygon.setStyle) {
            selectedPolygon.setStyle({fillOpacity: unselectedOpacity});
        }        

        //exit editing mode without saving
        document.getElementById('info-edit-mode').classList.add('hidden');
        document.getElementById('info-view-mode').classList.remove('hidden');

        selectedPolygon = null;
    }
}

function saveNotesField() {
    if (selectedPolygon && selectedPolygon.feature) {
        selectedPolygon.feature.properties = selectedPolygon.feature.properties || {};
        selectedPolygon.feature.properties.Notes = notesText.value.trim();
    }
}
//autosave just in case
notesText.addEventListener('input', ()=> {
    clearTimeout(notesTimeout);
    notesTimeout = setTimeout(() => {
        saveNotesField();
        console.log('saved ' + notesText.value);
    }, 400);
});

map.on('click', (e) => {
    if (e.originalEvent.button === 0) {closeInfoPanel();}
});

//////////editing version of the panel

const featureAttributeNames = [
    'Name',
    'Address',
    'Category',
    'Phone',
    'Website',
    'Instagram',
    'Dimensions',
    'Notes',
    'Label', 
    'LabelSize',
    'LabelRotation',
    'AdjustX',
    'AdjustY',
    'labelOriginNum',
    'labelBackground',
    'labelDir', 
    'shapeAngle'
];

const viewModeContainer = document.getElementById('info-view-mode');
const editModeContainer = document.getElementById('info-edit-mode');

let isEditAdvancedMode = false;
let initialEditName = '';

//enter edit mode
document.getElementById('start-edit-btn').addEventListener('click', () => {
    viewModeContainer.classList.add('hidden');
    editModeContainer.classList.remove('hidden');
    populateEditFields();
});

//cancel to enter view mode
document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    editModeContainer.classList.add('hidden');
    viewModeContainer.classList.remove('hidden');
});

document.getElementById('toggle-edit-mode-btn').addEventListener('click', (e) => {
    isEditAdvancedMode = !isEditAdvancedMode;
    e.target.textContent = isEditAdvancedMode ? 'ENTER BASIC MODE' : 'ENTER ADVANCED MODE';
    if (isEditAdvancedMode) {
        document.getElementById('edit-basic-mode').classList.add('hidden');
        document.getElementById('edit-advanced-mode').classList.remove('hidden');
    } else {
        document.getElementById('edit-basic-mode').classList.remove('hidden');
        document.getElementById('edit-advanced-mode').classList.add('hidden');
    }
});

document.getElementById('basic-LabelSize').addEventListener('change', (e) => {
    const controls = document.getElementById('basic-label-controls');
    if (e.target.value === 'none') {
        controls.classList.add('hidden');
    } else {
        controls.classList.remove('hidden');
    }
});

document.getElementById('basic-add-field').addEventListener('change', (e) => {
    const field = e.target.value;
    if (field) {
        document.getElementById(`basic-${field}-group`).classList.remove('hidden');
        refreshBasicAddDropdown();
    }
});


//removes add field options dynamically
function refreshBasicAddDropdown() {
    const dropdown = document.getElementById('basic-add-field');
    const optionalFields = ['Phone', 'Website', 'Instagram', 'Dimensions'];
    
    //clear current options except the placeholder
    dropdown.innerHTML = '<option value="" disabled selected>Add Field...</option>';
    
    optionalFields.forEach(field => {
        const group = document.getElementById(`basic-${field}-group`);
        //only add to dropdown if the field is currently hidden (has 'hidden' class)
        if (group.classList.contains('hidden')) {
            const opt = document.createElement('option');
            opt.value = field;
            opt.textContent = field;
            dropdown.appendChild(opt);
        }
    });
}


//the juicy bits
function populateEditFields() {
    if (!selectedPolygon) return;
    const props = selectedPolygon.feature.properties;
    
    //for checking modifications upon saving
    initialEditName = props.Name || '';

    //basic mode
    const mandatoryFields = ['Name', 'Address', 'Category'];
    const optionalFields = ['Phone', 'Website', 'Instagram', 'Dimensions'];

    mandatoryFields.forEach(field => {
        document.getElementById(`basic-${field}`).value = props[field] || '';
    });

    optionalFields.forEach(field => {
        const el = document.getElementById(`basic-${field}`);
        const group = document.getElementById(`basic-${field}-group`);
        if (props[field] !== null && props[field] !== undefined && props[field] !== '') {
            el.value = props[field];
            group.classList.remove('hidden');
        } else {
            el.value = '';
            group.classList.add('hidden');
        }
    });

    //label states
    const labelControls = document.getElementById('basic-label-controls');
    if (props.isEditableLabel) { //dont allow editing of non-basic labels
        document.getElementById('basic-LabelSize-group').classList.remove('hidden');
        document.getElementById('label-hr').classList.remove('hidden');
        const sizeStr = reverseLabelFontSize(props.LabelSize);
        document.getElementById('basic-LabelSize').value = sizeStr;

        if (sizeStr === 'none') {
            labelControls.classList.add('hidden');
        } else {
            labelControls.classList.remove('hidden');
            document.getElementById('basic-labelDir').value = props.labelDir || 'center';
            document.getElementById('basic-labelBackground').value = (props.labelBackground) ? 'enabled' : 'disabled';
        }
    } else {
        document.getElementById('basic-LabelSize-group').classList.add('hidden');
        document.getElementById('label-hr').classList.add('hidden');
        labelControls.classList.add('hidden');
    }


    //advanced mode time
    const editFormAdvancedFields = document.getElementById('edit-form-advanced-fields');
    editFormAdvancedFields.innerHTML = ''; 

    featureAttributeNames.forEach(attr => {
        const wrapper = document.createElement('div');
        wrapper.className = 'form-group';
        
        const label = document.createElement('label');
        label.textContent = attr;
        label.htmlFor = `feature-${attr.toLowerCase().replace(/\s+/g, '-')}`;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `feature-${attr.toLowerCase().replace(/\s+/g, '-')}`;
        input.dataset.key = attr;

        let val = props[attr];
        if (val === null || val === undefined || val === '') {
            input.value = 'NULL';
            input.classList.add('null-input');
        } else {
            input.value = `${val}`;
        }

        input.addEventListener('focus', function() {
            if (this.classList.contains('null-input') && this.value === 'NULL') {
                this.value = '';
                this.classList.remove('null-input');
            }
        });

        input.addEventListener('blur', function() {
            if (this.value.trim() === '') {
                this.value = 'NULL';
                this.classList.add('null-input');
            }
        });
        
        wrapper.appendChild(label);
        wrapper.appendChild(input);
        editFormAdvancedFields.appendChild(wrapper);
    });

    refreshBasicAddDropdown();
}

//pt2
document.getElementById('save-edit-btn').addEventListener('click', () => {
    if (!selectedPolygon) {return;}

    const props = selectedPolygon.feature.properties;
    const numericAttributes = ['LabelSize', 'LabelRotation', 'AdjustX', 'AdjustY', 'labelOriginNum', 'shapeAngle'];

    if (isEditAdvancedMode) {
        const inputs = document.getElementById('edit-form-advanced-fields').querySelectorAll('input');
        inputs.forEach(input => {
            const key = input.dataset.key;
            const lval = input.value.trim().toLowerCase();

            if (input.classList.contains('null-input') && input.value === 'NULL') {
                props[key] = null;
            } else if (lval === 'true') {
                props[key] = true;
            } else if (lval === 'false') {
                props[key] = false;
            } else {
                if (numericAttributes.includes(key)) {
                    const parsed = parseFloat(input.value);
                    props[key] = isNaN(parsed) ? null : parsed;
                } else {
                    props[key] = input.value;
                }
            }
        });
    } else {
        //basic mode
        const allBasicInputs = ['Name', 'Address', 'Category', 'Phone', 'Website', 'Instagram', 'Dimensions'];
        allBasicInputs.forEach(field => {
            const val = document.getElementById(`basic-${field}`).value.trim();
            props[field] = (val !== '') ? val : null;
        });

        //mirror name to label only if label was changed
        const newName = props.Name || '';
        if (newName !== initialEditName) {
            props.Label = newName;
        }

        //apply label changes
        if (props.isEditableLabel) {
            if (props.Label === null || props.Label === undefined) {
                props.Label = props.Name;
            }
            const size = document.getElementById('basic-LabelSize').value;
            const dir = document.getElementById('basic-labelDir').value;
            const fill = document.getElementById('basic-labelBackground').value;

            setCustomLabelProps(props, (props.shapeAngle ?? 0), dir, size, fill);
        }
    }

    //IMPORANT - CANNOT CHANGE LABELS DURING ROTATE MODE
    deactivateActiveTool();
    if (selectedPolygon.labelMarker || selectedPolygon.feature.properties.LabelSize) {
        createLabelMarker(selectedPolygon.feature, selectedPolygon);
        updateLabelSize(selectedPolygon.labelMarker);
    } else if (selectedPolygon.getTooltip && selectedPolygon.getTooltip() && props.Name) {
        selectedPolygon.bindTooltip(props.Name, {direction: 'top'});
    }
    
    //swap back
    editModeContainer.classList.add('hidden');
    viewModeContainer.classList.remove('hidden');
    openInfoPanel(props, selectedPolygon);
});







//scale indicator
L.control.scale({
    maxWidth: 120
}).addTo(map);


function metersToFeet(meters) {
    return meters*3.280839895;
}
function feetToMeters(feet) {
    return feet/3.280839895;
}

////////drawing controls
map.pm.addControls({
    position: 'topleft',
    drawMarker: true,
    drawPolygon: true,
    drawRectangle: true,
    drawCircle: false,
    drawCircleMarker: false,
    drawPolyline: false,
    drawText: false,
    editMode: true,
    dragMode: true,
    cutPolygon: false,
    removalMode: true
}); 

map.pm.setPathOptions(customShapeStyling);
map.pm.setGlobalOptions({
    rectangleAngle: -10, //offsetting from canvas rotation
    continueDrawing: true,
});

//marker overrides
function getColoredMarkerIcon(color, tooltip=false) {
    const svgTemplate = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 52" width="32" height="52">
            <path d="M16 0C7.16 0 0 7.16 0 16c0 12 16 36 16 36s16-24 16-36c0-8.84-7.16-16-16-16zm0 24c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="${color}"/>
            <circle cx="16" cy="16" r="8" fill="#fff" />
        </svg>
    `;
    
    return L.icon({
        iconUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent(svgTemplate),
        iconSize: [25, 41],
        iconAnchor: [12.5, 41],
        popupAnchor: [0, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        shadowSize: [41, 41],
        shadowAnchor: [12, 41],
        tooltipAnchor: (tooltip ? [0, -41] : [0,0])
    });
}



//sidebar stuff
const config = {
    panel : document.getElementById('tool-config'),
    close : document.getElementById('config-close'),
    title : document.getElementById('config-title'),
    common : document.getElementById('config-common'),
    marker : document.getElementById('config-marker'),
    rectangle : document.getElementById('config-rectangle'),
    polygon : document.getElementById('config-polygon'),
    helperText : document.getElementById('config-helper-text')
};

const helperTextLookup = {
    'Marker' : 'Click anywhere on the map to drop a point marker to label a specific location.',
    'Rectangle' : 'Use the draw mode selector to change from free draw to a fixed size. Draw many rectangles at once with the stack along line mode.',
    'Polygon' : 'Click on the map to start drawing a custom boundary shape. Click your starting point again to finish.',
    'Edit' : 'Click on a shape to show its corners, then drag them to tweak or reshape the layout.',
    'Drag' : 'Click and hold any shape on the map to slide it to a new location.',
    'Removal' : 'Click on any shape or marker on the map to permanently delete it.',
    'Rotate' : 'Click and drag the rotation handles around a shape to spin it to the correct angle.',
    'Select' : 'Click on a shape to view its properties. From there, you can edit its attributes in either basic or advanced mode. Click on any of the tools in the lefthand toolbar to edit the map. Use the layer controls to manage and save your drawings. Features you create will automatically go to the selected layer.'
}

let nothingActive = false;
function setNothingActive(newVal) {
    const selButton = document.querySelector('.custom-icon-free-select').parentElement.parentElement;
    if (newVal !== nothingActive) {
        if (newVal === true) {
            selButton.classList.add('custom-active');
        } else {
            selButton.classList.remove('custom-active');
        }
    }
    nothingActive = newVal;
}


function hideAllSidebarElements() {
    [config.close, config.common, config.marker, config.rectangle, config.polygon].forEach(el => {
        el.classList.add('hidden');
    });
    config.title.textContent = 'Free Select';
    config.helperText.textContent = helperTextLookup['Select'];
    setNothingActive(true);
}

setTimeout(() => {hideAllSidebarElements();}, 10);

////free select mode
map.pm.Toolbar.createCustomControl({
    name: 'freeSelect',
    block: 'custom',
    title: 'Free Select',
    className: 'custom-icon-free-select',
    toggle: true,
    disableOtherButtons: true,
    disabledByOtherButtons: true,
    afterClick: () => {
        // Clicking the tool simply triggers your function
        console.log("wow");
    }
    
});

map.pm.Toolbar.changeControlOrder([
    "freeSelect"
]);


const configTitleLookup = {
    'Marker' : 'Place Markers',
    'Rectangle' : 'Create Rectangles',
    'Polygon' : 'Create Polygons',
    'Edit' : 'Edit Vertices',
    'Drag' : 'Drag & Move',
    'Removal' : 'Erase Features',
    'Rotate' : 'Free Rotate',
    'Select' : 'Free Select'
}


function updateSidebarUI(modeStr, isShapeDraw = true) {
    hideAllSidebarElements();
    console.log("sfsd")
    config.close.classList.remove('hidden');

    //reset all fields
    // config.panel.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
    //     input.value = '';
    // });
    document.getElementById('rect-mode').selectedIndex = 0;

    //reset rectangle submenu
    document.getElementById('rect-fixed-inputs').classList.add('hidden')

    //start displaying things again
    config.panel.classList.remove('hidden');
    config.title.textContent = configTitleLookup[modeStr];

    if (isShapeDraw) { //is draw tool
        config.common.classList.remove('hidden'); //name field
        if (modeStr === 'Marker') {
            config.marker.classList.remove('hidden');
        } else if (modeStr === 'Rectangle') {
            config.rectangle.classList.remove('hidden');
        } else if (modeStr === 'Polygon') {
            config.polygon.classList.remove('hidden');
        }
    } else { //is edit tool

    }
    config.helperText.textContent = helperTextLookup[modeStr] ?? 'qeqow';
    setNothingActive(modeStr === 'Select');
}


//helper function
function resetCustomRectangleModes() {
    isCustomRectModeActive = false;
    cleanupFixedRectMode();
    cleanupStackRectMode();
    document.getElementById('rect-mode').value = 'free';
    setGeomanRectangleActive(false);
}

//link geoman toggles to sidebar ui
map.on('pm:globaldrawmodetoggled', (e) => {
    const isRect  = (e.shape === 'Rectangle');

    //case when there's a custom tool active and the user tries
    //to click rectangle button again to close the tab
    //(this e.enabled is backwards)
    if (e.enabled && isRect && isCustomRectModeActive) {
        map.pm.disableDraw(); //force a disable event
        resetCustomRectangleModes();
        hideAllSidebarElements();
    }
    //exiting in any case other than exiting free rect to custom rect
    //which is sort of a fake exit
    else if (!e.enabled && !isCustomRectModeActive) {
        hideAllSidebarElements();
    } 
    //any tool turning on
    else if (e.enabled) {
        if (!isRect) {
            resetCustomRectangleModes();
        }
        updateSidebarUI(e.shape, true);
    }
});

const editModes = {
    'pm:globaleditmodetoggled': 'Edit',
    'pm:globaldragmodetoggled': 'Drag',
    'pm:globalremovalmodetoggled': 'Removal',
    'pm:globalrotatemodetoggled': 'Rotate'
};

Object.entries(editModes).forEach(([event, modeStr]) => {
    map.on(event, (e) => {
        if (e.enabled) {
            resetCustomRectangleModes();
            updateSidebarUI(modeStr, false);
        }
        else {
            hideAllSidebarElements();
        }
    });
});


//adding in default state
let isCustomRectModeActive = false;

//force turn on/off rect button
function setGeomanRectangleActive(isActive) {
    const rectBtn = document.querySelector('.leaflet-pm-icon-rectangle');
    if (rectBtn) {
        const container = rectBtn.closest('.button-container');
        if (container) {
            if (isActive) {
                container.classList.add('active');
            }
            else {
                container.classList.remove('active');
            }
        }
    }
}


//the big one
//adding in fixed size rectangles
let ghostLayer = null;

//custom snapping function from geoman's stuff
function getSnappedLatLng(latlng) {
    const drawInstance = map.pm.Draw.Rectangle;

    if (!map.pm.getGlobalOptions().snappable) {
        return latlng;
    }
    if (!drawInstance._snapList) {
        drawInstance._createSnapList();
    }

    if (drawInstance._snapList && drawInstance._snapList.length > 0) {
        const closestLayer = drawInstance._calcClosestLayer(latlng, drawInstance._snapList);
        
        if (closestLayer && closestLayer.distance !== undefined) {
            const isMarker = closestLayer.layer instanceof L.Marker || 
                                closestLayer.layer instanceof L.CircleMarker || 
                                !drawInstance.options.snapSegment;
            
            let snapLatLng;
            if (!isMarker) {
                snapLatLng = drawInstance._checkPrioritiySnapping(closestLayer);
            } else {
                snapLatLng = closestLayer.latlng;
            }

            //if within distance
            const snapDistance = drawInstance.options.snapDistance || 30;
            if (closestLayer.distance < snapDistance) {
                return snapLatLng;
            }
        }
    }

    return latlng;
}


//gotta rotate my own rectangles
function getRotatedRectanglePoints(center, widthFt, heightFt, angleDegrees) {
    const widthM = feetToMeters(widthFt);
    const heightM = feetToMeters(heightFt);

    const rad = angleDegrees * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const corners = [
        {x: -widthM/2, y:  heightM/2},
        {x:  widthM/2, y:  heightM/2},
        {x:  widthM/2, y: -heightM/2},
        {x: -widthM/2, y: -heightM/2}
    ];

    const earthRadius = 6378137; // in meters

    return corners.map(p => {
        //2d rotation matrix
        const rx = p.x * cos - p.y * sin;
        const ry = p.x * sin + p.y * cos;

        //converting offsets back into latlng
        const dLat = (ry / earthRadius) * (180 / Math.PI);
        const dLng = (rx / (earthRadius * Math.cos(center.lat * Math.PI / 180))) * (180 / Math.PI);

        return L.latLng(center.lat + dLat, center.lng + dLng);
    });
}

//handle hover
function onFixedRectMouseMove(e) {
    const widthFt = parseFloat(document.getElementById('rect-width').value);
    const heightFt = parseFloat(document.getElementById('rect-height').value);

    //skip if inputs are empty/invalid
    if (isNaN(widthFt) || isNaN(heightFt) || widthFt <= 0 || heightFt <= 0) {
        if (ghostLayer) { //cleanup
            map.removeLayer(ghostLayer);
            ghostLayer = null;
        }
        return;
    }

    const angle = map.pm.getGlobalOptions().rectangleAngle || 0;
    //gotta set angle to negative to counteract screen angle
    const points = getRotatedRectanglePoints(e.latlng, widthFt, heightFt, -angle);
    let latlngOffset = {
        dlat: 0,
        dlng: 0
    }
    for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        const snapped = getSnappedLatLng(cur);
        if (cur.lat !== snapped.lat || cur.lng !== snapped.lng) {
            //yes this is cheating, no it probably doesn't matter
            latlngOffset.dlat = snapped.lat - cur.lat;
            latlngOffset.dlng = snapped.lng - cur.lng;
            break;
        }
    }
    const snappedPoints = points.map(cur => L.latLng(
        cur.lat + latlngOffset.dlat,
        cur.lng + latlngOffset.dlng
    ));
    if (!ghostLayer) { //create new
        ghostLayer = L.polygon(snappedPoints, {
            ...customShapeStyling,
            dashArray: '5, 5',
            fillOpacity: customShapeStyling.fillOpacity * 0.7,
            interactive: false
        });
        ghostLayer._pmTempLayer = true;
        ghostLayer.addTo(map);
    } else { //update old
        ghostLayer.setLatLngs(snappedPoints);
        if (needUpdateGhost) {
            ghostLayer.setStyle({
                ...customShapeStyling,
                dashArray: '5, 5',
                fillOpacity: customShapeStyling.fillOpacity * 0.7,
                interactive: false
            });
        }
    }
    needUpdateGhost = false;
}

function onFixedRectClick(e) { //much of the same
    const widthFt = parseFloat(document.getElementById('rect-width').value);
    const heightFt = parseFloat(document.getElementById('rect-height').value);

    //skip if inputs are empty/invalid
    if (isNaN(widthFt) || isNaN(heightFt) || widthFt <= 0 || heightFt <= 0) {
        return;
    }

    const angle = map.pm.getGlobalOptions().rectangleAngle || 0;
    //gotta set angle to negative to counteract screen angle
    const points = getRotatedRectanglePoints(e.latlng, widthFt, heightFt, -angle);
    let latlngOffset = {
        dlat: 0,
        dlng: 0
    }
    for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        const snapped = getSnappedLatLng(cur);
        if (cur.lat !== snapped.lat || cur.lng !== snapped.lng) {
            //yes this is cheating, no it probably doesn't matter
            latlngOffset.dlat = snapped.lat - cur.lat;
            latlngOffset.dlng = snapped.lng - cur.lng;
            break;
        }
    }
    const snappedPoints = points.map(cur => L.latLng(
        cur.lat + latlngOffset.dlat,
        cur.lng + latlngOffset.dlng
    ));

    const fixedPoly = L.polygon(snappedPoints, customShapeStyling).addTo(map);

    //catch geoman up to speed
    if (fixedPoly.pm) {
        fixedPoly.pm.setOptions({pmIgnore: false});
        fixedPoly.pm.enable();
        fixedPoly.pm.disable();
    }
    //newly improved
    map.pm.Draw.Rectangle._createSnapList();

    //fake a create event so everything else works correctly
    map.fire('pm:create', {
        shape: 'Rectangle',
        layer: fixedPoly,
        width: widthFt,
        height: heightFt
    });
}


function cleanupFixedRectMode() {
    map.off('mousemove', onFixedRectMouseMove);
    map.off('click', onFixedRectClick);
    map.getContainer().classList.remove('fixed-rect-active');
    if (ghostLayer) {
        map.removeLayer(ghostLayer);
        ghostLayer = null;
    }
    enableLayerClick = true;
}


//////////stack code
let stackStartLatLng = null;
let stackGhostCircle = null;
let stackGhostRect = null;
let stackGhostLine = null;
let stackGhostGroup = L.featureGroup();

//this should be familiar
function onStackRectMouseMove(e) {
    const widthFt = parseFloat(document.getElementById('rect-width').value);
    const heightFt = parseFloat(document.getElementById('rect-height').value);

    //skip if inputs are empty/invalid
    if (isNaN(widthFt) || isNaN(heightFt) || widthFt <= 0 || heightFt <= 0) {
        //cleanup
        if (stackGhostCircle) {
            map.removeLayer(stackGhostCircle);
            stackGhostCircle = null;
        }
        if (stackGhostRect) {
            map.removeLayer(stackGhostRect);
            stackGhostRect = null;
        }
        return;
    }

    //if no clicks yet
    //show preview circle and rect
    if (!stackStartLatLng) {
        const angle = map.pm.getGlobalOptions().rectangleAngle || 0;
        const points = getRotatedRectanglePoints(e.latlng, widthFt, heightFt, -angle);
        const ghostRadius = feetToMeters(Math.sqrt(widthFt * widthFt + heightFt * heightFt) / 2);

        if (!stackGhostCircle || !stackGhostRect) { //create new
            stackGhostCircle = L.circle(e.latlng, {
                ...customShapeStyling,
                dashArray: '5, 5',
                fillOpacity: 0,
                interactive: false,
                radius: ghostRadius
            });
            stackGhostCircle._pmTempLayer = true;
            stackGhostCircle.addTo(map);

            stackGhostRect = L.polygon(points, {
                ...customShapeStyling,
                dashArray: '5, 5',
                fillOpacity: customShapeStyling.fillOpacity * 0.7,
                interactive: false,
            });
            stackGhostRect._pmTempLayer = true;
            stackGhostRect.addTo(map);
        } else { //update old
            stackGhostCircle.setLatLng(e.latlng);
            stackGhostCircle.setRadius(ghostRadius);
            stackGhostRect.setLatLngs(points);
            if (needUpdateGhost) {
                stackGhostCircle.setStyle({
                    ...customShapeStyling,
                    dashArray: '5, 5',
                    fillOpacity: 0,
                    interactive: false,
                    radius: ghostRadius
                });
                stackGhostRect.setStyle({
                    ...customShapeStyling,
                    dashArray: '5, 5',
                    fillOpacity: customShapeStyling.fillOpacity * 0.7,
                    interactive: false
                });
            }
        }
        needUpdateGhost = false;
        return;
    }

    if (!stackGhostLine) {
        stackGhostLine = L.polyline([stackStartLatLng, e.latlng], {
            color: customShapeStyling.color,
            dashArray: '5, 5',
            weight: 2,
            interactive: false
        }).addTo(map);
    } else {
        stackGhostLine.setLatLngs([stackStartLatLng, e.latlng]);
        if (needUpdateGhost) {
            stackGhostLine.setStyle({
                color: customShapeStyling.color,
                dashArray: '5, 5',
                weight: 2,
                interactive: false
            });
        }
    }
    needUpdateGhost = false;
    stackGhostGroup.clearLayers();

    const widthM = feetToMeters(widthFt);
    const heightM = feetToMeters(heightFt);
    const earthRadius = 6378137;

    //get total line length
    const dy = (e.latlng.lat - stackStartLatLng.lat) * (Math.PI / 180) * earthRadius;
    const dx = (e.latlng.lng - stackStartLatLng.lng) * (Math.PI / 180) * earthRadius * Math.cos(stackStartLatLng.lat * Math.PI / 180);

    const line_angle_rad = Math.atan2(dy, dx);
    const line_angle_deg = line_angle_rad * (180 / Math.PI);

    const lineDistanceM = Math.sqrt(dx * dx + dy * dy);
    const count = Math.floor((lineDistanceM / widthM) + 0.5);

    //loop to keep creating ghost rects
    for (let i = 0; i < count; i++) {
        const dist_m = i * widthM;
        const p_rx = dist_m * Math.cos(line_angle_rad);
        const p_ry = dist_m * Math.sin(line_angle_rad);

        const rect_start_lat = stackStartLatLng.lat + (p_ry / earthRadius) * (180 / Math.PI);
        const rect_start_lng = stackStartLatLng.lng + (p_rx / (earthRadius * Math.cos(stackStartLatLng.lat * Math.PI / 180))) * (180 / Math.PI);

        const rectLatLng = L.latLng(rect_start_lat, rect_start_lng);
        const points = getRotatedRectanglePoints(rectLatLng, widthFt, heightFt, line_angle_deg);

        const ghostRect = L.polygon(points, {
            ...customShapeStyling,
            dashArray: '5, 5',
            fillOpacity: customShapeStyling.fillOpacity * 0.7,
            interactive: false
        });
        stackGhostGroup.addLayer(ghostRect);
    }
}

function onStackRectClick(e) {
    const widthFt = parseFloat(document.getElementById('rect-width').value);
    const heightFt = parseFloat(document.getElementById('rect-height').value);

    //skip if inputs are empty/invalid
    if (isNaN(widthFt) || isNaN(heightFt) || widthFt <= 0 || heightFt <= 0) {
        return;
    }

    //first click
    if (!stackStartLatLng) {
        stackStartLatLng = e.latlng;
        //leaving the circle
        if (stackGhostRect) {
            map.removeLayer(stackGhostRect);
            stackGhostRect = null;
        }
        return;
    }

    const widthM = feetToMeters(widthFt);
    const heightM = feetToMeters(heightFt);
    const earthRadius = 6378137;

    //get total line length
    const dy = (e.latlng.lat - stackStartLatLng.lat) * (Math.PI / 180) * earthRadius;
    const dx = (e.latlng.lng - stackStartLatLng.lng) * (Math.PI / 180) * earthRadius * Math.cos(stackStartLatLng.lat * Math.PI / 180);

    const line_angle_rad = Math.atan2(dy, dx);
    const line_angle_deg = line_angle_rad * (180 / Math.PI);
    
    //math for labels
    const mapAngle = map.pm.getGlobalOptions().rectangleAngle || 0;

    const lineDistanceM = Math.sqrt(dx * dx + dy * dy);
    const count = Math.floor((lineDistanceM / widthM) + 0.5);

    //loop to keep creating ghost rects
    for (let i = 0; i < count; i++) {
        const dist_m = i * widthM;
        const p_rx = dist_m * Math.cos(line_angle_rad);
        const p_ry = dist_m * Math.sin(line_angle_rad);

        const rect_start_lat = stackStartLatLng.lat + (p_ry / earthRadius) * (180 / Math.PI);
        const rect_start_lng = stackStartLatLng.lng + (p_rx / (earthRadius * Math.cos(stackStartLatLng.lat * Math.PI / 180))) * (180 / Math.PI);

        const rectLatLng = L.latLng(rect_start_lat, rect_start_lng);
        const points = getRotatedRectanglePoints(rectLatLng, widthFt, heightFt, line_angle_deg);

        const finalPoly = L.polygon(points, customShapeStyling).addTo(map);
    
        //this again
        if (finalPoly.pm) {
            finalPoly.pm.setOptions({pmIgnore: false});
            finalPoly.pm.enable();
            finalPoly.pm.disable();
        }

        //fire event
        map.fire('pm:create', {
            shape: 'Rectangle',
            layer: finalPoly,
            angleDegrees: (line_angle_deg + mapAngle),
            width: widthFt,
            height: heightFt
        });
    }

    //reset
    stackStartLatLng = null;
    if (stackGhostCircle) {
        map.removeLayer(stackGhostCircle);
        stackGhostCircle = null;
    }
    if (stackGhostLine) {
        map.removeLayer(stackGhostLine);
        stackGhostLine = null;
    }
    stackGhostGroup.clearLayers();
}

function cleanupStackRectMode() {
    map.off('mousemove', onStackRectMouseMove);
    map.off('click', onStackRectClick);
    map.getContainer().classList.remove('stack-rect-active');
    if (stackGhostCircle) {
        map.removeLayer(stackGhostCircle);
        stackGhostCircle = null;
    }
    if (stackGhostRect) {
        map.removeLayer(stackGhostRect);
        stackGhostRect = null;
    }
    if (stackGhostLine) {
        map.removeLayer(stackGhostLine);
        stackGhostLine = null;
    }
    if (stackGhostGroup) {
        stackGhostGroup.clearLayers();
        map.removeLayer(stackGhostGroup);
    }
    stackStartLatLng = null;
    enableLayerClick = true;
}

//set up entering/exiting and event listeners
document.getElementById('rect-mode').addEventListener('change', (e) => {
    const val = e.target.value;
    const fixedInputs = document.getElementById('rect-fixed-inputs');

    //reset everything on mode change
    fixedInputs.classList.add('hidden');
    cleanupFixedRectMode();
    cleanupStackRectMode();

    if (val === 'fixed') {
        //setup button magic
        isCustomRectModeActive = true; 
        map.pm.disableDraw();
        setTimeout(() => {setGeomanRectangleActive(true); }, 5);

        fixedInputs.classList.remove('hidden');
        
        
        config.panel.classList.remove('hidden');

        enableLayerClick = false;
        map.getContainer().classList.add('fixed-rect-active');

        map.on('mousemove', onFixedRectMouseMove);
        setTimeout(() => map.on('click', onFixedRectClick), 10);
    } else if (val === 'stack') {
        isCustomRectModeActive = true; 
        map.pm.disableDraw();
        setTimeout(() => {setGeomanRectangleActive(true); }, 5);

        fixedInputs.classList.remove('hidden');
        config.panel.classList.remove('hidden');

        enableLayerClick = false; 
        map.getContainer().classList.add('stack-rect-active');

        stackGhostGroup.addTo(map);

        map.on('mousemove', onStackRectMouseMove);
        setTimeout(() => map.on('click', onStackRectClick), 10);
    } else if (val === 'free') {
        isCustomRectModeActive = false; 
        //put us back on
        map.pm.enableDraw('Rectangle');
    }
});

//don't know where else to put this
document.getElementById('rect-label-size').addEventListener('change', (e) => {
    const val = e.target.value;
    const labelControls = document.getElementById('rect-label-controls');
    if (val === 'none') {
        labelControls.classList.add('hidden');
    } else {
        labelControls.classList.remove('hidden');
    }
});


//tsk tsk bad OOP leaflet
function getLayerCenter(layer) {
    if (typeof layer.getLatLng === 'function') {
        return layer.getLatLng();
    } else if (typeof layer.getBounds === 'function') {
        return layer.getBounds().getCenter();
    }
    return null;
}

//do not ask me how this works
function distanceSquaredToBox(drawnCenter, bounds) { 
    //make points into flat cartesian
    const p = map.latLngToLayerPoint(drawnCenter);
    const nw = map.latLngToLayerPoint(bounds.getNorthWest());
    const se = map.latLngToLayerPoint(bounds.getSouthEast());

    //limits
    const xmin = Math.min(nw.x, se.x);
    const xmax = Math.max(nw.x, se.x);
    const ymin = Math.min(nw.y, se.y);
    const ymax = Math.max(nw.y, se.y);

    //value should clamp down to 0
    const dx = Math.max(xmin - p.x, 0, p.x - xmax);
    const dy = Math.max(ymin - p.y, 0, p.y - ymax);

    //thanks pythagoras
    return dx * dx + dy * dy;
}


function findClosestBusinessName(drawnLayer) {
    const drawnCenter = getLayerCenter(drawnLayer);

    let minDistSquared = Infinity;
    let closestName = '';

    businessGroup.getLayers().forEach(bLayer => {
        const dist = distanceSquaredToBox(drawnCenter, bLayer.getBounds());
        if (dist < minDistSquared) {
            minDistSquared = dist;
            closestName = bLayer.feature?.properties?.Name || '';
            if (closestName === "Unoccupied" || closestName === "Mixed Use") {
                closestName = bLayer.feature?.properties?.Address || '';
            }
        }
    });

    if (Math.sqrt(minDistSquared) > 200) {return '';}
    return closestName;
}

//very very bad
function getLabelOriginOffset(value) {
    switch (value) {
        case 'bottom':
            return 0;
        case 'left':
            return 1;
        case 'top':
            return 2;
        case 'right':
            return 3;
        case 'center':
            return 3; //same as right
        default:
            return null;
    }
}

function getLabelFontSize(value) {
    switch (value) {
        case 'small':
            return 2
        case 'medium':
            return 4
        case 'large':
            return 7;
        default:
            return null;
    }
}

function reverseLabelFontSize(num) {
    if (!num || num <= 0) {
        return 'none';
    }
    
    if (num >= 7) {
        return 'large'
    } else if (num >= 4) {
        return 'medium'
    } else {
        return 'small';
    }
}

function setCustomLabelProps(properties, angleDegrees, dir, size, fill) {
    if (!size || !dir || !fill || !getLabelFontSize(size)) {
        return;
    }
    //do this stuff even if center
    //center is just a non-adjusted flavor of right/left
    const userOffset = getLabelOriginOffset(dir); //right = 1 (now 3)

    //num of 90 degree shifts
    const shift = Math.round(angleDegrees / 90) % 4;
    const targetVertex = (userOffset - shift + 4) % 4;

    let angle = ((targetVertex * 90 - 90 + angleDegrees) % 360 + 360) % 360;
    let flipped = false;
    if (angle >= 88 && angle < 268) {
        angle = (angle + 180) % 360;
        flipped = true;
    }
    if (dir !== 'center') {
        properties.labelOriginNum = targetVertex;
        properties.AdjustX = (flipped) ? 50 : -50;
    }
    properties.LabelRotation = angle;
    properties.LabelSize = getLabelFontSize(size);
    properties.labelBackground = (fill === 'enabled');
    properties.labelDir = dir;
}



map.on('pm:create', (e) => {
    const layer = e.layer;
    const shapeType = e.shape;

    const currentActiveLayer = mapLayers.find(l => (l.id === selectedLayerID));

    if (currentActiveLayer) {
        currentActiveLayer.featureGroup.addLayer(layer);
        //probably dont need this but
        if (layer.setStyle) {
            layer.setStyle({
                color: currentActiveLayer.color,
                fillColor: currentActiveLayer.color,
                fillOpacity: customShapeStyling.fillOpacity
            });
        } else if (shapeType === 'Marker' && typeof layer.setIcon === 'function') {
            layer.setIcon(getColoredMarkerIcon(currentActiveLayer.color, true));
        }
    } else {
        console.error('oh no');
        map.addLayer(layer);
    }

    const closestName = findClosestBusinessName(layer);

    layer.feature = {
        type: 'Feature',
        properties: {
            Name: document.getElementById('shape-name').value || `Custom ${shapeType}`,
            Category: currentActiveLayer.name,
            Address: (closestName) ? `Near ${closestName}` : null,
            isEditableLabel: true
        }
    };

    
    if (shapeType === 'Rectangle') {
        //set dimensions category
        if (e.width && e.height) {
            layer.feature.properties.Dimensions = `${e.width}' x ${e.height}'`;
        }

        //create label
        const rectLabelSize = document.getElementById('rect-label-size').value;
        const rectLabelDir = document.getElementById('rect-label-dir').value;
        const rectLabelFill = document.getElementById('rect-label-fill').value;
        layer.feature.properties.shapeAngle = -(e.angleDegrees ?? 0);
        
        if (rectLabelSize !== 'none') {
            setCustomLabelProps(
                layer.feature.properties,
                layer.feature.properties.shapeAngle,
                rectLabelDir,
                rectLabelSize,
                rectLabelFill
            )
            layer.feature.properties.Label = layer.feature.properties.Name;
            createLabelMarker(layer.feature, layer);
            updateLabelSize(layer.labelMarker);
        }

    }


    // if (typeof layer.bindTooltip === 'function') {
    //     layer.bindTooltip(layer.feature.properties.Name, {direction: 'top'});
    // }
    bindShapeEvents(layer, layer.feature);
});



//for the close button randomly
function deactivateActiveTool() {
    if (map.pm.globalDrawModeEnabled()) {
        map.pm.disableDraw();
    }
    
    if (map.pm.globalEditModeEnabled()) {map.pm.toggleGlobalEditMode(false);}
    if (map.pm.globalDragModeEnabled()) {map.pm.toggleGlobalDragMode(false);}
    if (map.pm.globalRemovalModeEnabled()) {map.pm.toggleGlobalRemovalMode(false);}
    if (map.pm.globalRotateModeEnabled()) {map.pm.toggleGlobalRotateMode(false);}

    if (isCustomRectModeActive) {
        resetCustomRectangleModes(); 
        hideAllSidebarElements();
    }
}









////// filtering stuff!!
function filterToPredicate(predicate) {
    mapLayers.forEach((mapLayer) => {
        if (mapLayer.stripes) {
            mapLayer.stripes.remove();
        }
        
        mapLayer.stripes = new L.StripePattern({
            width: 18,
            height: 18,
            weight: 9,
            spaceWeight: 9,
            color: mapLayer.color,
            spaceColor: mapLayer.color,
            spaceOpacity: 0.8,
            angle: 45
        });
        mapLayer.stripes.addTo(map);

        mapLayer.featureGroup.eachLayer((layer) => {
            if (predicate(layer)) {
                if (layer._path) {
                    layer._path.classList.add('highlight');
                    layer._path.classList.remove('lowlight');
                }
                if (layer.setStyle) {
                    layer.setStyle({fillPattern: null});
                }
                if (layer.labelMarker) {
                    layer.labelMarker.getElement().style.opacity = 1;
                }
            } else {
                if (layer._path) {
                    layer._path.classList.remove('highlight');
                    layer._path.classList.add('lowlight');
                }
                if (layer.setStyle) {
                    layer.setStyle({fillPattern: mapLayer.stripes});
                }
                if (layer.labelMarker) {
                    layer.labelMarker.getElement().style.opacity = 0.3;
                }
            }
        });
    });
}

function clearAllFilters() {
    mapLayers.forEach((mapLayer) => {
        mapLayer.featureGroup.eachLayer((layer) => {
            if (layer._path) {
                layer._path.classList.remove('highlight');
                layer._path.classList.remove('lowlight');
            }
            if (layer.setStyle) {
                layer.setStyle({fillPattern: null})
            }
            if (layer.labelMarker) {
                layer.labelMarker.getElement().style.opacity = 1;
            }
        });
    });
}


const searchInput = document.getElementById('search');
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
        clearAllFilters();
        return;
    }

    filterToPredicate((layer) => {
        const properties = layer.feature?.properties;
        if (!properties) {return false;}

        const name = String(properties.Name || '').toLowerCase();
        const address = String(properties.Address || '').toLowerCase();
        const category = String(properties.Category || '').toLowerCase();

        return name.includes(query) || address.includes(query) || category.includes(query);
    })
});
