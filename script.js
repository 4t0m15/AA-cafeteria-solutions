        var map = L.map('map').setView([51.505, -0.09], 13);
        var foodBankData = {};
        var foodBankLocationsFound = [];
        var recyclingCentersFound = [];
        var markerCluster = L.markerClusterGroup({
            chunkedLoading: true,
            zoomToBoundsOnClick: true,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false
        });
        var markers = [];
        var currentSearchType = 'all';
        var displayedLocations = []; // To store the currently displayed locations

        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        // Add the marker cluster to the map
        map.addLayer(markerCluster);

        // Initialize the map once the content is loaded
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize the map
            initMap();
            // Load food bank data
            loadFoodBankData();
            
            // Add event listener for Enter key
            document.getElementById('zipCode').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') findRecyclingCenters();
            });
        });

        // Initialize map
        function initMap() {
            if (map) map.remove();
            map = L.map('map').setView([54.0, -2.0], 6); // Center on UK initially
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);
            
            // Re-add marker cluster after map initialization
            markerCluster = L.markerClusterGroup({
                chunkedLoading: true,
                zoomToBoundsOnClick: true,
                spiderfyOnMaxZoom: true,
                showCoverageOnHover: false
            });
            map.addLayer(markerCluster);
        }

        // Calculate distance (translated from go (https://github.com/ypankaj007/haversine-formula))
        function calculateDistance(lat1, lon1, lat2, lon2) {
            const RadiusOfEarth = 6371; // Radius of the Earth in km
            const latitudeDifference = (lat2 - lat1) * Math.PI / 180;
            const longitudeDifference = (lon2 - lon1) * Math.PI / 180;
            const centralAngleComponent =
                Math.sin(longitudeDifference/2) * Math.sin(latitudeDifference/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(longitudeDifference/2) * Math.sin(longitudeDifference/2);
            const centralAngle = 2 * Math.atan2(Math.sqrt(centralAngleComponent), Math.sqrt(1-centralAngleComponent));
            return RadiusOfEarth * centralAngle; // Distance in km (imperial > metric)
        }

        // Extract recycling materials from tags
        function getRecyclingMaterials(tags) {
            const materials = [];
            for (const key in tags) {
                if (key.startsWith('recycling:') && tags[key] === 'yes') {
                    materials.push(key.substring(10));
                }
            }
            return materials;
        }

        // Clear all markers from the map
        function clearMarkers() {
            markerCluster.clearLayers();
            markers.forEach(marker => {
                if (marker instanceof L.MarkerClusterGroup) {
                    marker.clearLayers();
                } else if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                }
            });
            markers = [];
        }

        // Load food bank data from JSON file
        function loadFoodBankData() {
            // Show loading message
            document.getElementById("results").innerHTML = '<div class="loader"><i class="fas fa-spinner"></i><span>Loading food bank data...</span></div>';
            
            // Show data status section
            document.getElementById("data-status").style.display = "block";
            document.getElementById("food-bank-status").innerHTML = '<i class="fas fa-spinner fa-spin"></i> Food Banks: Loading from <a href="https://github.com/whatfoodbanksneed/food_bank_api" target="_blank">whatfoodbanksneed/food_bank_api</a>...';
            
            // Define the fallback data in case everything fails
            const fallbackData = {
                "London Colney - Temporary": {
                    "address": "Caledon Community Centre, Caledon Rd, London Colney, St Albans AL2 1PU",
                    "latitude": "51.7228722",
                    "longitude": "-0.2996495",
                    "website": "http://stalbansdistrict.foodbank.org.uk/",
                    "items_needed": [
                        "Pasta",
                        "Milk (long life)",
                        "Fruit Juice (long life)",
                        "Instant Mash/Tinned Potatoes",
                        "Tinned Soup",
                        "Dried Noodles",
                        "Jam & Spreads"
                    ],
                    "location_type": "food_bank_centre",
                    "parent_food_bank": "St Albans and District Foodbank"
                },
                "Mowbray Community Church, Harrogate": {
                    "address": "1 Westmoreland St, Harrogate HG1 5AY, UK",
                    "latitude": "53.99702063265868",
                    "longitude": "-1.5303109043686618",
                    "website": "http://harrogatedistrict.foodbank.org.uk/",
                    "items_needed": [
                        "Long Life Fruit Juice",
                        "Long Life Milk",
                        "Pasta Sauce",
                        "Chocolate",
                        "Sponge Puddings"
                    ],
                    "location_type": "food_bank_centre",
                    "parent_food_bank": "Harrogate District Foodbank"
                }
            };
            
            // Fetch from the GitHub Gist (data originally sourced from whatfoodbanksneed/food_bank_api by Martin Lugton)
            fetch('https://gist.githubusercontent.com/4t0m15/ed9c9b8608e1b07f7bdd96b938b7f90b/raw', {
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // Store the data
                    foodBankData = data;
                    
                    // Check if data is empty or invalid
                    if (!foodBankData || Object.keys(foodBankData).length === 0) {
                        console.warn("Loaded data was empty, using fallback data");
                        foodBankData = fallbackData;
                    }
                    
                    // Normalize the data format
                    normalizeData();
                    
                    // Update UI with the correct count of loaded food banks
                    updateInitialUI();
                    
                    // Update status
                    document.getElementById("food-bank-status").innerHTML = '<i class="fas fa-check" style="color: green;"></i> Food Banks: Loaded ' + Object.keys(foodBankData).length + ' locations from <a href="https://gist.github.com/4t0m15/ed9c9b8608e1b07f7bdd96b938b7f90b" target="_blank">This Github Gist.</a>';
                    
                    console.log("Food bank data loaded successfully", Object.keys(foodBankData).length, "locations");
                })
                .catch(error => {
                    console.error("Error loading food bank data:", error);
                    document.getElementById("results").innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>Error loading food bank data: ${error.message}</span>
                        </div>
                        <div class="no-results">
                            <i class="fas fa-map-marked-alt"></i>
                            <p>Enter a location above to find recycling centers near you.</p>
                            <p style="margin-top: 15px;"><strong>But don't worry!</strong> You can still search for recycling centers even without food bank data.</p>
                            <button id="retry-load-btn" style="margin-top: 15px;">Try Loading Food Bank Data Again</button>
                        </div>
                    `;
                    
                    // Fall back to sample data
                    foodBankData = fallbackData;
                    normalizeData();
                    
                    // Add event listener for retry button
                    document.getElementById('retry-load-btn').addEventListener('click', loadFoodBankData);
                    
                    // Update status
                    document.getElementById("food-bank-status").innerHTML = '<i class="fas fa-exclamation-triangle" style="color: orange;"></i> Food Banks: Using fallback data (' + Object.keys(foodBankData).length + ' locations)';
                    
                    // Update UI with fallback data
                    updateInitialUI();
                });
        }
        
        // Update the initial UI with the food bank count
        function updateInitialUI() {
                    document.getElementById("results").innerHTML = `
                <div class="no-results">
                    <i class="fas fa-map-marked-alt"></i>
                    <p>Enter a location above to find food banks and recycling centers near you.</p>
                    <p style="margin-top: 10px;">Database loaded with <strong>${Object.keys(foodBankData).length}</strong> food bank locations.</p>
                        </div>
                    `;
        }

        // Geocode location using Nominatim; this is how 
        function geocodeLocation(location) {
            return new Promise((resolve, reject) => {
                const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;

                fetch(nominatimUrl)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Network error: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (!data || !data.length) {
                            throw new Error("Location not found");
                        }

                        const userLocation = {
                            lat: parseFloat(data[0].lat),
                            lon: parseFloat(data[0].lon),
                            displayName: data[0].display_name
                        };

                        // Center map on user location
                        map.setView([userLocation.lat, userLocation.lon], 10);

                        // Add user location marker
                        const userMarker = L.marker([userLocation.lat, userLocation.lon], {
                            icon: L.divIcon({
                                className: 'user-location-marker',
                                html: '<i class="fas fa-map-marker-alt" style="color: #3b82f6; font-size: 24px; text-shadow: 0 0 3px white;"></i>',
                                iconSize: [24, 24],
                                iconAnchor: [12, 24]
                            })
                        })
                        .addTo(map)
                        .bindPopup(`<b>Your Location</b><br>${userLocation.displayName || 'Searched location'}`);

                        markers.push(userMarker);

                        resolve(userLocation);
                    })
                    .catch(error => {
                        console.error("Geocoding failed:", error);
                        reject(error);
                    });
                });
        }

        // Modified function to handle errors in website URLs
        function normalizeData() {
            // Ensure all food bank entries have consistent format for items_needed
            let skipped = 0;
            
            for (const [name, data] of Object.entries(foodBankData)) {
                try {
                    // Convert string items to array if needed
                    if (data.items_needed) {
                        if (typeof data.items_needed === 'string') {
                            // Split by comma if it's a comma-separated string
                            data.items_needed = data.items_needed.split(',').map(item => item.trim());
                        } else if (!Array.isArray(data.items_needed)) {
                            // Convert to array with single item for any other type
                            data.items_needed = [String(data.items_needed)];
                        }
                    } else {
                        // Provide default if missing
                        data.items_needed = ['No specific items listed'];
                    }
                    
                    // Ensure latitude and longitude are properly formatted
                    if (data.latitude && typeof data.latitude === 'string') {
                        data.latitude = parseFloat(data.latitude);
                    }
                    
                    if (data.longitude && typeof data.longitude === 'string') {
                        data.longitude = parseFloat(data.longitude);
                    }
                    
                    // Add lat and lng for compatibility with recycling centers
                    data.lat = data.latitude;
                    data.lng = data.longitude;
                    
                    // Skip invalid entries
                    if (isNaN(data.latitude) || isNaN(data.longitude)) {
                        console.warn(`Skipping ${name} due to invalid coordinates`);
                        continue;
                    }
                    
                    // Ensure other required fields
                    if (!data.address) data.address = 'Address not available';
                    if (!data.location_type) data.location_type = 'Food Bank';
                    
                    // Ensure website is properly formatted - fix escaped slashes
                    if (data.website && typeof data.website === 'string') {
                        // Fix escaped slashes in URLs - replace all instances of \/ with /
                        data.website = data.website.replace(/\\\//g, '/');
                    }
                    
                    // Add name property for consistency with recycling centers
                    data.name = name;
                } catch (e) {
                    console.warn(`Error normalizing data for ${name}:`, e);
                    skipped++;
                }
            }
            
            if (skipped > 0) {
                console.warn(`Skipped normalizing ${skipped} entries due to errors`);
            }
        }

        function findRecyclingCenters() {
            const zip = document.getElementById("zipCode").value.trim();
            if (!zip) {
                document.getElementById("results").innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Please enter a location to search.</span>
                    </div>
                    <div class="no-results">
                        <i class="fas fa-map-marked-alt"></i>
                        <p>Enter a location above to find food banks and recycling centers near you.</p>
                    </div>
                `;
                return;
            }

            // Clear previous results
            document.getElementById("results").innerHTML = '<div class="loader"><i class="fas fa-spinner"></i><span>Searching...</span></div>';
            
            // Clear existing markers
            clearMarkers();
            
            // Reset previous findings
            foodBankLocationsFound = [];
            recyclingCentersFound = [];

            // Geocode the location
            geocodeLocation(zip)
                .then(userLocation => {
                    // Get the current filter type
                    currentSearchType = document.getElementById('locationType').value;
                    
                    // Find nearby food banks (if data is available and filter allows)
                    if (currentSearchType === 'all' || currentSearchType === 'food_bank') {
                        findFoodBanksNear(userLocation);
                    } 
                    // Find nearby recycling centers (if filter allows)
                    if (currentSearchType === 'all' || currentSearchType === 'recycling') {
                        findRecyclingCentersNear(userLocation);
                    } else {
                        // If only showing food banks, display combined results anyway
                        displayCombinedResults();
                    }
                })
                .catch(error => {
                    console.error("Search error:", error);
                    document.getElementById("results").innerHTML = `
                        <div class="error-message">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span>${error.message}</span>
                        </div>
                        <div class="no-results">
                            <i class="fas fa-map-marked-alt"></i>
                            <p>Try searching for a major city like "London" or "Manchester".</p>
                        <p>Make sure your internet connection is working properly.</p>
                        </div>
                    `;
                });
        }

        // Find food banks near a location
        function findFoodBanksNear(userLocation) {
            console.log("Searching for food banks near", userLocation);

            // Skip if food bank data is not loaded
            if (!foodBankData || Object.keys(foodBankData).length === 0) {
                console.warn("Food bank data not available");
                return;
            }

            const MAX_DISTANCE = 30; // km
            foodBankLocationsFound = [];

            // Loop through all food banks to find those within range
            for (const [name, data] of Object.entries(foodBankData)) {
                try {
                    if (!data.lat || !data.lng) continue;
                    
                    const distance = calculateDistance(
                        userLocation.lat, userLocation.lon,
                        data.lat, data.lng
                    );
                    
                    if (distance <= MAX_DISTANCE) {
                        foodBankLocationsFound.push({
                            ...data,
                            distance: distance,
                            type: 'food_bank'
                        });
                    }
                } catch (error) {
                    console.warn(`Error calculating distance for ${name}:`, error);
                }
            }

            // Sort by distance
            foodBankLocationsFound.sort((a, b) => a.distance - b.distance);
            
            // Add markers to the map
            addFoodBankMarkers(foodBankLocationsFound);
            
            console.log(`Found ${foodBankLocationsFound.length} food banks within ${MAX_DISTANCE}km`);
            
            // Display combined results (this will be called after recycling centers are found too)
            displayCombinedResults();
        }

        // Find recycling centers near a location using Overpass API
        function findRecyclingCentersNear(userLocation) {
            console.log("Searching for recycling centers near", userLocation);

            // Update status
            document.getElementById("recycling-status").innerHTML = '<i class="fas fa-spinner fa-spin"></i> Recycling Centers: Searching via Overpass API...';

            const radius = 10000; // 10km in meters
            recyclingCentersFound = [];

            // Build Overpass API query
            const overpassQuery = `
                [out:json];
                (
                  node["amenity"="recycling"](around:${radius},${userLocation.lat},${userLocation.lon});
                  way["amenity"="recycling"](around:${radius},${userLocation.lat},${userLocation.lon});
                  relation["amenity"="recycling"](around:${radius},${userLocation.lat},${userLocation.lon});
                  node["recycling_type"](around:${radius},${userLocation.lat},${userLocation.lon});
                  way["recycling_type"](around:${radius},${userLocation.lat},${userLocation.lon});
                  relation["recycling_type"](around:${radius},${userLocation.lat},${userLocation.lon});
                );
                out body;
                >;
                out skel qt;
            `;

            // Call Overpass API (openstreetmap with a fancy name)
            fetch("https://overpass-api.de/api/interpreter", {
                method: "POST",
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                body: overpassQuery
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error("Overpass API request failed: " + response.status);
                }
                return response.json();
            })
            .then(data => {
                console.log("Recycling centers data received:", data);
                if (data && data.elements) {
                    // Process results
                    data.elements.forEach(element => {
                        if (element.type === "node" && element.tags && (element.tags.amenity === "recycling" || element.tags.recycling_type)) {
                            const name = element.tags.name ||
                                  (element.tags.recycling_type === "centre" ? "Recycling Centre" :
                                  (element.tags.recycling_type === "container" ? "Recycling Container" :
                                  "Recycling Point"));

                            const address = element.tags["addr:street"] ?
                                `${element.tags["addr:housenumber"] || ""} ${element.tags["addr:street"]}, ${element.tags["addr:city"] || ""}` :
                                (element.tags.address || element.tags.location || "Address not available");

                            const distance = calculateDistance(
                                userLocation.lat, userLocation.lon,
                                element.lat, element.lon
                            );

                            const materials = getRecyclingMaterials(element.tags);

                            recyclingCentersFound.push({
                                name: name,
                                lat: element.lat,
                                lng: element.lon,
                                distance: distance,
                                address: address,
                                operator: element.tags.operator,
                                recycling_type: element.tags.recycling_type,
                                materials: materials,
                                amenity: element.tags.amenity,
                                type: 'recycling'
                            });
                        }
                    });

                    // Sort by distance
                    recyclingCentersFound.sort((a, b) => a.distance - b.distance);

                    // Add markers to the map
                    addRecyclingMarkers(recyclingCentersFound);

                    console.log(`Found ${recyclingCentersFound.length} recycling points`);
                    
                    // Update status
                    document.getElementById("recycling-status").innerHTML = '<i class="fas fa-check" style="color: green;"></i> Recycling Centers: Found ' + recyclingCentersFound.length + ' locations';
                } else {
                    console.warn("No recycling center elements found in response:", data);
                }
                // Display combined results (even if we only have recycling centers)
                displayCombinedResults();
            })
            .catch(error => {
                console.error("Error fetching recycling centers:", error);
                // Create a few random recycling centers if the API fails
                if (recyclingCentersFound.length === 0) {
                    console.log("Creating some fallback recycling centers");
                    createFallbackRecyclingCenters(userLocation);
                    
                    // Update status
                    document.getElementById("recycling-status").innerHTML = '<i class="fas fa-exclamation-triangle" style="color: orange;"></i> Recycling Centers: Using fallback data (API failed)';
                } else {
                    // Update status
                    document.getElementById("recycling-status").innerHTML = '<i class="fas fa-exclamation-triangle" style="color: orange;"></i> Recycling Centers: API error, but found ' + recyclingCentersFound.length + ' locations';
                }
                // Still display combined results with whatever we have
                displayCombinedResults();
            });
        }

        // Create some fallback recycling centers in case the Overpass API fails
        function createFallbackRecyclingCenters(userLocation) {
            // Calculate points around the user location
            for (let i = 0; i < 5; i++) {
                // Random angle and distance
                const angle = Math.random() * 2 * Math.PI;
                const distance = 1 + Math.random() * 5; // 1-6km away
                
                // Calculate new coordinates (approximate)
                const lat_offset = distance * Math.cos(angle) / 111.32; // 1 degree lat = 111.32 km
                const lon_offset = distance * Math.sin(angle) / (111.32 * Math.cos(userLocation.lat * Math.PI/180)); // Adjust for latitude
                
                const recyclingCenter = {
                    name: `Recycling Center ${i+1}`,
                    lat: userLocation.lat + lat_offset,
                    lng: userLocation.lon + lon_offset,
                    distance: distance,
                    address: "Generated location",
                    recycling_type: ["centre", "container"][Math.floor(Math.random() * 2)],
                    materials: ["plastic", "paper", "glass", "metal", "electronics"].slice(0, Math.floor(Math.random() * 5) + 1),
                    type: 'recycling'
                };
                
                recyclingCentersFound.push(recyclingCenter);
            }
            
            // Add markers to the map
            addRecyclingMarkers(recyclingCentersFound);
        }

        // Add food bank markers to the map
        function addFoodBankMarkers(locations) {
            // Skip if we're only showing recycling centers
            if (currentSearchType === 'recycling') return;
            
            locations.forEach(location => {
                const marker = L.marker([location.lat, location.lng], {
                    icon: L.divIcon({
                        className: 'food-bank-marker',
                        html: '<i class="fas fa-shopping-basket" style="color: #fb923c; font-size: 24px;"></i>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                });

                // Create popup content
                const popupContent = `
                    <div class="popup-content">
                        <h3>${location.name}</h3>
                        <p><strong>Distance:</strong> ${location.distance.toFixed(1)} km</p>
                        <p><strong>Address:</strong> ${location.address}</p>
                        ${location.website ? `<p><strong>Website:</strong> <a href="${location.website}" target="_blank">${location.website}</a></p>` : ''}
                        ${location.phone ? `<p><strong>Phone:</strong> ${location.phone}</p>` : ''}
                        ${location.email ? `<p><strong>Email:</strong> ${location.email}</p>` : ''}
                        ${location.items_needed && location.items_needed.length > 0 ?
                            `<p><strong>Items Needed:</strong> ${location.items_needed.slice(0, 5).join(', ')}${location.items_needed.length > 5 ? '...' : ''}</p>` : ''}
                    </div>
                `;
                
                marker.bindPopup(popupContent);
                markerCluster.addLayer(marker);
                markers.push(marker);
            });
        }

        // Add recycling center markers to the map
        function addRecyclingMarkers(locations) {
            // Skip if we're only showing food banks
            if (currentSearchType === 'food_bank') return;
            
            locations.forEach(location => {
                const marker = L.marker([location.lat, location.lng], {
                    icon: L.divIcon({
                        className: 'recycling-marker',
                        html: '<i class="fas fa-recycle" style="color: #22c55e; font-size: 24px;"></i>',
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    })
                });
                
                // Create popup content
                const popupContent = `
                    <div class="popup-content">
                        <h3>${location.name}</h3>
                        <p><strong>Distance:</strong> ${location.distance.toFixed(1)} km</p>
                        <p><strong>Address:</strong> ${location.address}</p>
                        ${location.operator ? `<p><strong>Operator:</strong> ${location.operator}</p>` : ''}
                        ${location.recycling_type ? `<p><strong>Type:</strong> ${location.recycling_type}</p>` : ''}
                        ${location.materials && location.materials.length > 0 ?
                            `<p><strong>Materials:</strong> ${location.materials.join(', ')}</p>` : ''}
                    </div>
                `;

                marker.bindPopup(popupContent);
                markerCluster.addLayer(marker);
                markers.push(marker);
            });
        }

        // Display combined results from both food banks and recycling centers
        function displayCombinedResults() {
            const resultsContainer = document.getElementById('results');
            let paginationContainer = null;

            // Get all locations based on filter
            let allLocations = [];
            if (currentSearchType === 'all') {
                allLocations = [...foodBankLocationsFound, ...recyclingCentersFound];
            } else if (currentSearchType === 'food_bank') {
                allLocations = [...foodBankLocationsFound];
            } else if (currentSearchType === 'recycling') {
                allLocations = [...recyclingCentersFound];
            }
            
            // Sort by distance
            allLocations.sort((a, b) => a.distance - b.distance);
            
            // Store the currently displayed locations
            displayedLocations = allLocations;

            // If we have no results yet, don't display an error
            if (allLocations.length === 0 && resultsContainer.querySelector('.loader')) {
                // Still loading or no results found
                return;
            }

            // Check if we have results
            if (allLocations.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <i class="fas fa-search"></i>
                        <p>No ${currentSearchType === 'all' ? 'locations' : 
                           currentSearchType === 'food_bank' ? 'food banks' : 'recycling centers'} 
                           found nearby. Try increasing your search radius or searching in a different location.</p>
                    </div>`;
                return;
            }

            // Create results header
            resultsContainer.innerHTML = '';
            const resultsHeader = document.createElement('h2');
            resultsHeader.innerHTML = `<i class="fas fa-list-ul"></i> ${allLocations.length} locations found`;
            resultsContainer.appendChild(resultsHeader);

            // Create results list container
            const resultsListContainer = document.createElement('div');
            resultsListContainer.className = 'results-list';
            resultsContainer.appendChild(resultsListContainer);

            // Setup pagination
            const resultsPerPage = 20;
            const totalPages = Math.ceil(allLocations.length / resultsPerPage);
            let currentPage = 1;

            // Function to display a specific page
            function displayPage(page) {
                // Clear previous results
                resultsListContainer.innerHTML = '';
                
                // Calculate start and end indices
                const startIndex = (page - 1) * resultsPerPage;
                const endIndex = Math.min(startIndex + resultsPerPage, allLocations.length);

                // Display locations for current page
                for (let i = startIndex; i < endIndex; i++) {
                    const location = allLocations[i];
                    const locationElement = document.createElement('div');
                    locationElement.className = 'location-item';
                    locationElement.dataset.id = i; // Store index for later reference
                    
                    // Add specific CSS class based on location type
                    if (location.type === 'recycling') {
                        locationElement.style.borderLeftColor = 'var(--recycling)';
                    } else {
                        locationElement.style.borderLeftColor = 'var(--food-bank)';
                    }

                    if (location.type === 'food_bank') {
                        locationElement.innerHTML = `
                            <h3><i class="fas fa-shopping-basket food-bank-icon"></i> ${location.name} <span class="location-type type-food-bank">Food Bank</span></h3>
                            <p class="location-distance"><i class="fas fa-location-arrow"></i> ${location.distance.toFixed(1)} km</p>
                            <p class="location-address"><i class="fas fa-map-marker-alt"></i> ${location.address || 'Address not available'}</p>
                        `;
                        
                        // Add expandable content that will show when clicked
                        if (location.items_needed && location.items_needed.length > 0 || 
                            location.website || location.phone || location.email) {
                            
                            const expandableContent = document.createElement('div');
                            expandableContent.className = 'expandable-content';
                            expandableContent.style.display = 'none';
                            
                            let expandableHTML = '';
                            
                            if (location.website) {
                                expandableHTML += `<p><i class="fas fa-globe"></i> <a href="${location.website}" target="_blank">Website</a></p>`;
                            }
                            
                            if (location.phone) {
                                expandableHTML += `<p><i class="fas fa-phone"></i> ${location.phone}</p>`;
                            }
                            
                            if (location.email) {
                                expandableHTML += `<p><i class="fas fa-envelope"></i> ${location.email}</p>`;
                            }
                            
                            if (location.items_needed && location.items_needed.length > 0) {
                                expandableHTML += `
                                <div style="margin-top: 0.5rem;">
                                    <p><strong>Items Needed:</strong></p>
                        <ul class="items-list">
                                        ${location.items_needed.slice(0, 5).map(item => `<li>${item}</li>`).join('')}
                                        ${location.items_needed.length > 5 ? 
                                            `<li><i>...and ${location.items_needed.length - 5} more items</i></li>` : ''}
                        </ul>
                                </div>`;
                            }
                            
                            expandableContent.innerHTML = expandableHTML;
                            locationElement.appendChild(expandableContent);
                            
                            // Add "More" button if we have expandable content
                            if (expandableHTML) {
                                const moreBtn = document.createElement('button');
                                moreBtn.className = 'more-btn';
                                moreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> More info';
                                
                                moreBtn.addEventListener('click', function(e) {
                                    e.stopPropagation(); // Prevent triggering the parent click
                                    
                                    const content = this.parentNode.querySelector('.expandable-content');
                                    if (content.style.display === 'none') {
                                        content.style.display = 'block';
                                        this.innerHTML = '<i class="fas fa-chevron-up"></i> Less info';
                                    } else {
                                        content.style.display = 'none';
                                        this.innerHTML = '<i class="fas fa-chevron-down"></i> More info';
                                    }
                                });
                                
                                locationElement.appendChild(moreBtn);
                            }
                        }
                    } else {
                        locationElement.innerHTML = `
                            <h3><i class="fas fa-recycle recycling-icon"></i> ${location.name} <span class="location-type type-recycling">Recycling</span></h3>
                            <p class="location-distance"><i class="fas fa-location-arrow"></i> ${location.distance.toFixed(1)} km</p>
                            <p class="location-address"><i class="fas fa-map-marker-alt"></i> ${location.address || 'Address not available'}</p>
                        `;
                        
                        // Add expandable content for recycling centers too
                        if (location.materials && location.materials.length > 0 || 
                            location.operator || location.recycling_type || location.amenity) {
                            
                            const expandableContent = document.createElement('div');
                            expandableContent.className = 'expandable-content';
                            expandableContent.style.display = 'none';
                            
                            let expandableHTML = '';
                            
                            if (location.operator) {
                                expandableHTML += `<p><i class="fas fa-user"></i> Operated by: ${location.operator}</p>`;
                            }
                            
                            if (location.recycling_type) {
                                expandableHTML += `<p><i class="fas fa-info-circle"></i> Type: ${location.recycling_type}</p>`;
                            }
                            
                            if (location.materials && location.materials.length > 0) {
                                expandableHTML += `
                                <div style="margin-top: 0.5rem;">
                                    <p><strong>Materials Accepted:</strong></p>
                                    <ul class="items-list">
                                        ${location.materials.slice(0, 5).map(item => `<li>${item}</li>`).join('')}
                                        ${location.materials.length > 5 ? 
                                            `<li><i>...and ${location.materials.length - 5} more materials</i></li>` : ''}
                                    </ul>
                                </div>`;
                            }
                            
                            expandableContent.innerHTML = expandableHTML;
                            locationElement.appendChild(expandableContent);
                            
                            // Add "More" button if we have expandable content
                            if (expandableHTML) {
                                const moreBtn = document.createElement('button');
                                moreBtn.className = 'more-btn';
                                moreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> More info';
                                
                                moreBtn.addEventListener('click', function(e) {
                                    e.stopPropagation(); // Prevent triggering the parent click
                                    
                                    const content = this.parentNode.querySelector('.expandable-content');
                                    if (content.style.display === 'none') {
                                        content.style.display = 'block';
                                        this.innerHTML = '<i class="fas fa-chevron-up"></i> Less info';
                                    } else {
                                        content.style.display = 'none';
                                        this.innerHTML = '<i class="fas fa-chevron-down"></i> More info';
                                    }
                                });
                                
                                locationElement.appendChild(moreBtn);
                            }
                        }
                    }

                    // Add click event to center map on location
                    locationElement.addEventListener('click', function() {
                        // Center map
                        map.setView([location.lat, location.lng], 14);
                        
                        // Find and open the marker popup for this location
                        markerCluster.eachLayer(marker => {
                            const markerLatLng = marker.getLatLng();
                            if (Math.abs(markerLatLng.lat - location.lat) < 0.0001 && 
                                Math.abs(markerLatLng.lng - location.lng) < 0.0001) {
                                marker.openPopup();
                            }
                        });
                        
                        // Highlight this item
                        document.querySelectorAll('.location-item').forEach(item => {
                            item.classList.remove('active');
                        });
                        
                        this.classList.add('active');
                        
                        // On mobile, collapse the sidebar
                        if (window.innerWidth <= 768) {
                            document.querySelector('.sidebar').classList.remove('expanded');
                        }
                    });

                    resultsListContainer.appendChild(locationElement);
                }

                // Update current page
                currentPage = page;
                
                // Update pagination display
                if (paginationContainer) {
                    paginationContainer.querySelector('.current-page').textContent = `${currentPage}/${totalPages}`;
                    paginationContainer.querySelector('.prev-page').disabled = currentPage === 1;
                    paginationContainer.querySelector('.next-page').disabled = currentPage === totalPages;
                }
            }

            // Create pagination controls if needed
            if (totalPages > 1) {
                paginationContainer = document.createElement('div');
                paginationContainer.className = 'pagination';
                
                paginationContainer.innerHTML = `
                    <button class="prev-page" ${currentPage === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                    <span class="current-page">1/${totalPages}</span>
                    <button class="next-page" ${currentPage === totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
                `;

                // Add event listeners for pagination
                paginationContainer.querySelector('.prev-page').addEventListener('click', () => {
                    if (currentPage > 1) {
                        displayPage(currentPage - 1);
                    }
                });

                paginationContainer.querySelector('.next-page').addEventListener('click', () => {
                    if (currentPage < totalPages) {
                        displayPage(currentPage + 1);
                    }
                });

                resultsContainer.appendChild(paginationContainer);
            }

            // Display first page
            displayPage(1);
            
            // Add mobile toggle functionality
            if (window.innerWidth <= 768) {
                // Show the sidebar in expanded mode when results are found
                document.querySelector('.sidebar').classList.add('expanded');
                
                // When a location is clicked, collapse the sidebar
                document.querySelectorAll('.location-item').forEach(item => {
                    item.addEventListener('click', () => {
                        document.querySelector('.sidebar').classList.remove('expanded');
                    });
                });
            }
        }

        function deg2rad(deg) {
            return deg * (Math.PI/180);
        }

        function filterResults() {
            const selectedType = document.getElementById('locationType').value;
            currentSearchType = selectedType;
            
            // Clear existing markers
            clearMarkers();
            
            // Redisplay the appropriate markers
            if (currentSearchType === 'all' || currentSearchType === 'food_bank') {
                addFoodBankMarkers(foodBankLocationsFound);
            }
            
            if (currentSearchType === 'all' || currentSearchType === 'recycling') {
                addRecyclingMarkers(recyclingCentersFound);
            }
            
            // Update the results list
            displayCombinedResults();
        }