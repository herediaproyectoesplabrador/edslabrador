(function () {
	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function syncNavbarHeight() {
		const navbar = document.querySelector(".project-navbar");
		if (!navbar) return;

		const update = () => {
			document.documentElement.style.setProperty("--project-navbar-height", `${navbar.offsetHeight}px`);
		};

		update();
		window.addEventListener("resize", update);

		if ("ResizeObserver" in window) {
			new ResizeObserver(update).observe(navbar);
		}
	}

	function initRasterViewer(options = {}) {
		const viewport = document.getElementById(options.viewportId || "rasterViewport");
		const image = document.getElementById(options.imageId || "rasterImage");
		const slider = document.getElementById(options.sliderId || "zoomSlider");
		const output = document.getElementById(options.outputId || "zoomValue");
		const buttons = document.querySelectorAll("[data-zoom-command]");

		if (!viewport || !image || !slider || !output) return;

		const state = {
			scale: 1,
			fitScale: 1,
			minScale: 0.05,
			maxScale: 8,
			x: 0,
			y: 0,
			dragging: false,
			lastX: 0,
			lastY: 0
		};

		function setReadout() {
			const percent = Math.round(state.scale * 100);
			slider.value = String(percent);
			output.value = `${percent}%`;
		}

		function applyTransform() {
			image.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
			setReadout();
		}

		function centerImage() {
			const rect = viewport.getBoundingClientRect();
			state.x = Math.round((rect.width - image.naturalWidth * state.scale) / 2);
			state.y = Math.round((rect.height - image.naturalHeight * state.scale) / 2);
			applyTransform();
		}

		function calculateFitScale() {
			const rect = viewport.getBoundingClientRect();
			const padding = rect.width < 700 ? 28 : 56;
			const availableWidth = Math.max(1, rect.width - padding);
			const availableHeight = Math.max(1, rect.height - padding);
			const fit = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1);
			state.fitScale = clamp(fit, state.minScale, state.maxScale);
			state.scale = state.fitScale;
			centerImage();
		}

		function zoomAt(nextScale, originX, originY) {
			const scale = clamp(nextScale, state.minScale, state.maxScale);
			const imageX = (originX - state.x) / state.scale;
			const imageY = (originY - state.y) / state.scale;

			state.scale = scale;
			state.x = originX - imageX * state.scale;
			state.y = originY - imageY * state.scale;
			applyTransform();
		}

		function zoomFromCenter(nextScale) {
			const rect = viewport.getBoundingClientRect();
			zoomAt(nextScale, rect.width / 2, rect.height / 2);
		}

		viewport.addEventListener("wheel", (event) => {
			event.preventDefault();
			const rect = viewport.getBoundingClientRect();
			const factor = Math.exp(-event.deltaY * 0.0012);
			zoomAt(state.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
		}, {passive: false});

		viewport.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			state.dragging = true;
			state.lastX = event.clientX;
			state.lastY = event.clientY;
			viewport.classList.add("is-dragging");
			viewport.setPointerCapture(event.pointerId);
		});

		viewport.addEventListener("pointermove", (event) => {
			if (!state.dragging) return;
			const dx = event.clientX - state.lastX;
			const dy = event.clientY - state.lastY;
			state.lastX = event.clientX;
			state.lastY = event.clientY;
			state.x += dx;
			state.y += dy;
			applyTransform();
		});

		function stopDragging(event) {
			state.dragging = false;
			viewport.classList.remove("is-dragging");
			if (event && viewport.hasPointerCapture(event.pointerId)) {
				viewport.releasePointerCapture(event.pointerId);
			}
		}

		viewport.addEventListener("pointerup", stopDragging);
		viewport.addEventListener("pointercancel", stopDragging);
		viewport.addEventListener("dblclick", (event) => {
			const rect = viewport.getBoundingClientRect();
			zoomAt(state.scale * 1.6, event.clientX - rect.left, event.clientY - rect.top);
		});

		slider.addEventListener("input", () => {
			zoomFromCenter(Number(slider.value) / 100);
		});

		buttons.forEach((button) => {
			button.addEventListener("click", () => {
				const command = button.dataset.zoomCommand;
				if (command === "in") zoomFromCenter(state.scale * 1.25);
				if (command === "out") zoomFromCenter(state.scale / 1.25);
				if (command === "reset") {
					state.scale = state.fitScale;
					centerImage();
				}
			});
		});

		window.addEventListener("resize", calculateFitScale);

		if (image.complete && image.naturalWidth) {
			calculateFitScale();
		} else {
			image.addEventListener("load", calculateFitScale, {once: true});
		}
	}

	function formatCount(count, singular, plural) {
		return `${count} ${count === 1 ? singular : plural}`;
	}

	function setEmptyState(container, message) {
		container.innerHTML = "";
		const empty = document.createElement("div");
		empty.className = "resource-empty";
		empty.textContent = message;
		container.appendChild(empty);
	}

	async function fetchManifest(url) {
		const response = await fetch(url, {cache: "no-store"});
		if (!response.ok) {
			throw new Error(`No se pudo cargar ${url}`);
		}

		return response.json();
	}

	function resolveResourceUrl(manifestUrl, file) {
		return new URL(file, new URL(manifestUrl, window.location.href)).href;
	}

	function fileNameFromUrl(url) {
		const pathname = new URL(url, window.location.href).pathname;
		const name = pathname.split("/").filter(Boolean).pop();
		return decodeURIComponent(name || "descarga");
	}

	function normalizeDownloadItem(item) {
		if (!item) return null;

		if (typeof item === "string") {
			const href = new URL(item, window.location.href).href;
			return {href, fileName: fileNameFromUrl(href)};
		}

		const href = new URL(item.url || item.href || item.file, window.location.href).href;
		return {
			href,
			fileName: item.fileName || item.name || fileNameFromUrl(href)
		};
	}

	function downloadFiles(files, options = {}) {
		const items = files.map(normalizeDownloadItem).filter(Boolean);
		const delay = options.delay ?? 260;
		const confirmThreshold = options.confirmThreshold ?? 24;
		const label = options.label || "archivos";
		const statusElement = options.statusElement || null;

		if (items.length === 0) {
			if (statusElement) statusElement.textContent = "No hay archivos para descargar.";
			return false;
		}

		if (items.length > confirmThreshold) {
			const ok = window.confirm(`Se iniciara la descarga de ${items.length} ${label}. El navegador puede pedir permiso para descargas multiples.`);
			if (!ok) {
				if (statusElement) statusElement.textContent = "Descarga cancelada.";
				return false;
			}
		}

		if (statusElement) {
			statusElement.textContent = `Iniciando ${items.length} ${items.length === 1 ? "descarga" : "descargas"}...`;
		}

		items.forEach((item, index) => {
			window.setTimeout(() => {
				const link = document.createElement("a");
				link.href = item.href;
				link.download = item.fileName;
				link.rel = "noopener";
				document.body.appendChild(link);
				link.click();
				link.remove();

				if (statusElement && index === items.length - 1) {
					statusElement.textContent = `Descarga solicitada: ${items.length} ${items.length === 1 ? "archivo" : "archivos"}.`;
				}
			}, index * delay);
		});

		return true;
	}

	function renderDocumentCard(documentItem, manifestUrl) {
		const article = document.createElement("article");
		article.className = "document-card";

		const title = document.createElement("h3");
		title.textContent = documentItem.title || documentItem.file || "Documento";

		const meta = document.createElement("p");
		meta.textContent = [documentItem.date, documentItem.format || documentItem.file?.split(".").pop()?.toUpperCase()]
			.filter(Boolean)
			.join(" / ");

		const link = document.createElement("a");
		link.className = "resource-action";
		link.href = resolveResourceUrl(manifestUrl, documentItem.file);
		link.target = "_blank";
		link.rel = "noopener";
		link.textContent = "Abrir documento";

		article.append(title, meta, link);
		return article;
	}

	function initPublishedDocuments(options = {}) {
		const manifestUrl = options.manifestUrl || "resources/documentos/manifest.json";
		const qualityList = document.getElementById("qualityReportList");
		const documentList = document.getElementById("documentList");
		const documentCount = document.getElementById("documentCount");
		if (!qualityList || !documentList || !documentCount) return;

		fetchManifest(manifestUrl)
			.then(manifest => {
				const documents = Array.isArray(manifest.documents) ? manifest.documents : [];
				const qualityReports = documents.filter(item => item.type === "quality-report");
				const technicalDocuments = documents.filter(item => item.type !== "quality-report");

				documentCount.textContent = String(documents.length);

				if (qualityReports.length === 0) {
					setEmptyState(qualityList, "No hay reporte de calidad publicado.");
				} else {
					qualityList.replaceChildren(...qualityReports.map(item => renderDocumentCard(item, manifestUrl)));
				}

				if (technicalDocuments.length === 0) {
					setEmptyState(documentList, "No hay documentos tecnicos publicados.");
				} else {
					documentList.replaceChildren(...technicalDocuments.map(item => renderDocumentCard(item, manifestUrl)));
				}
			})
			.catch(error => {
				console.error(error);
				documentCount.textContent = "0";
				setEmptyState(qualityList, "No se pudo cargar el manifest de documentos.");
				setEmptyState(documentList, "Revise resources/documentos/manifest.json.");
			});
	}

	function normalizeSearch(value) {
		return value.trim().toLowerCase();
	}

	function loadGalleryImage(image) {
		if (!image || image.dataset.loaded === "true") return;

		const src = image.dataset.src;
		if (!src) return;

		image.src = src;
		image.dataset.loaded = "true";
		image.removeAttribute("data-src");
	}

	function observeGalleryImages(container) {
		const images = Array.from(container.querySelectorAll("img[data-src]"));
		if (images.length === 0) return null;

		if (!("IntersectionObserver" in window)) {
			images.forEach(loadGalleryImage);
			return null;
		}

		const observer = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;

				const image = entry.target;
				loadGalleryImage(image);
				observer.unobserve(image);
			}
		}, {
			rootMargin: "240px 0px",
			threshold: 0.01
		});

		images.forEach(image => observer.observe(image));
		return observer;
	}

	function renderImageCard(item, group, manifestUrl, index) {
		const article = document.createElement("article");
		article.className = "gallery-card";
		article.dataset.number = item.number || "";
		article.dataset.group = group;
		article.dataset.galleryIndex = String(index);

		const button = document.createElement("button");
		button.type = "button";
		button.className = "gallery-card-button";
		button.setAttribute("aria-label", `Abrir ${item.title || item.number || "imagen"}`);

		const image = document.createElement("img");
		image.dataset.src = resolveResourceUrl(manifestUrl, item.file);
		image.alt = item.title || `Imagen ${item.number || ""}`;
		image.loading = "lazy";
		image.decoding = "async";

		const body = document.createElement("div");
		body.className = "gallery-card-body";

		const number = document.createElement("strong");
		number.textContent = item.number || "Sin numero";

		const title = document.createElement("span");
		title.textContent = item.title || (group === "drone" ? "Vuelo drone" : "Panoramica");

		body.append(number, title);
		button.append(image, body);

		const selectLabel = document.createElement("label");
		selectLabel.className = "gallery-select";

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.dataset.gallerySelect = String(index);
		checkbox.setAttribute("aria-label", `Seleccionar ${item.title || item.number || "imagen"}`);

		const selectText = document.createElement("span");
		selectText.textContent = "Seleccionar";

		selectLabel.append(checkbox, selectText);
		article.append(button, selectLabel);
		return article;
	}

	function createGalleryCarousel() {
		const overlay = document.createElement("div");
		overlay.className = "gallery-carousel";
		overlay.hidden = true;
		overlay.innerHTML = `
			<div class="gallery-carousel-panel" role="dialog" aria-modal="true" aria-labelledby="galleryCarouselTitle">
				<div class="gallery-carousel-bar">
					<div>
						<strong id="galleryCarouselTitle"></strong>
						<span id="galleryCarouselMeta"></span>
					</div>
					<div class="gallery-carousel-actions">
						<div class="gallery-zoom-controls" aria-label="Zoom de imagen">
							<button id="galleryZoomOut" class="gallery-carousel-icon-button" type="button" aria-label="Alejar">-</button>
							<output id="galleryZoomValue">100%</output>
							<button id="galleryZoomIn" class="gallery-carousel-icon-button" type="button" aria-label="Acercar">+</button>
							<button id="galleryZoomReset" class="gallery-carousel-button" type="button">Ajustar</button>
						</div>
						<a id="galleryCarouselDownload" class="gallery-carousel-button gallery-carousel-primary" href="#" download>Descargar</a>
						<button id="galleryCarouselClose" class="gallery-carousel-icon-button" type="button" aria-label="Cerrar">x</button>
					</div>
				</div>
				<div class="gallery-carousel-stage">
					<button id="galleryCarouselPrev" class="gallery-carousel-nav gallery-carousel-prev" type="button" aria-label="Imagen anterior">&lsaquo;</button>
					<img id="galleryCarouselImage" alt="">
					<button id="galleryCarouselNext" class="gallery-carousel-nav gallery-carousel-next" type="button" aria-label="Imagen siguiente">&rsaquo;</button>
				</div>
			</div>
		`;
		document.body.appendChild(overlay);

		return {
			overlay,
			panel: overlay.querySelector(".gallery-carousel-panel"),
			title: overlay.querySelector("#galleryCarouselTitle"),
			meta: overlay.querySelector("#galleryCarouselMeta"),
			download: overlay.querySelector("#galleryCarouselDownload"),
			close: overlay.querySelector("#galleryCarouselClose"),
			prev: overlay.querySelector("#galleryCarouselPrev"),
			next: overlay.querySelector("#galleryCarouselNext"),
			stage: overlay.querySelector(".gallery-carousel-stage"),
			image: overlay.querySelector("#galleryCarouselImage"),
			zoomIn: overlay.querySelector("#galleryZoomIn"),
			zoomOut: overlay.querySelector("#galleryZoomOut"),
			zoomReset: overlay.querySelector("#galleryZoomReset"),
			zoomValue: overlay.querySelector("#galleryZoomValue")
		};
	}

	function initPublishedImageGallery(options = {}) {
		const manifestUrl = options.manifestUrl || "resources/imagenes/manifest.json";
		const searchInput = document.getElementById("imageSearch");
		const readout = document.getElementById("galleryReadout");
		const imageCount = document.getElementById("imageCount");
		const panoramicGallery = document.getElementById("panoramicGallery");
		const droneGallery = document.getElementById("droneGallery");
		const panoramicCount = document.getElementById("panoramicCount");
		const droneCount = document.getElementById("droneCount");
		const selectVisibleButton = document.getElementById("selectVisibleImages");
		const clearSelectedButton = document.getElementById("clearSelectedImages");
		const downloadSelectedButton = document.getElementById("downloadSelectedImages");
		const downloadVisibleButton = document.getElementById("downloadVisibleImages");
		const downloadAllButton = document.getElementById("downloadAllImages");
		const downloadStatus = document.getElementById("imageDownloadStatus");
		if (!searchInput || !readout || !imageCount || !panoramicGallery || !droneGallery) return;

		const carousel = createGalleryCarousel();
		let galleryItems = [];
		let visibleIndexes = [];
		let activeVisibleIndex = 0;
		let lazyImageObserver = null;
		const zoomState = {
			scale: 1,
			minScale: 1,
			maxScale: 5,
			x: 0,
			y: 0,
			dragging: false,
			lastX: 0,
			lastY: 0
		};

		function getGroupLabel(group) {
			return group === "drone" ? "Vuelo drone" : "Panoramica";
		}

		function getVisibleIndexes() {
			return Array.from(document.querySelectorAll(".gallery-card"))
				.filter(card => !card.hidden)
				.map(card => Number(card.dataset.galleryIndex))
				.filter(Number.isFinite);
		}

		function getSelectedIndexes() {
			return Array.from(document.querySelectorAll("[data-gallery-select]:checked"))
				.map(input => Number(input.dataset.gallerySelect))
				.filter(Number.isFinite);
		}

		function filesFromIndexes(indexes) {
			return indexes
				.map(index => galleryItems[index])
				.filter(Boolean)
				.map(item => ({
					url: item.url,
					fileName: item.fileName || fileNameFromUrl(item.url)
				}));
		}

		function updateSelectionControls() {
			const selectedCount = getSelectedIndexes().length;
			const visibleCount = getVisibleIndexes().length;

			if (downloadSelectedButton) {
				downloadSelectedButton.disabled = selectedCount === 0;
				downloadSelectedButton.textContent = selectedCount === 0
					? "Descargar seleccionadas"
					: `Descargar seleccionadas (${selectedCount})`;
			}

			if (downloadVisibleButton) {
				downloadVisibleButton.disabled = visibleCount === 0;
			}

			if (selectVisibleButton) {
				selectVisibleButton.disabled = visibleCount === 0;
			}
		}

		function constrainPan() {
			if (zoomState.scale <= 1) {
				zoomState.x = 0;
				zoomState.y = 0;
				return;
			}

			const stageRect = carousel.stage.getBoundingClientRect();
			const imageRect = carousel.image.getBoundingClientRect();
			const maxX = Math.max(24, (imageRect.width - stageRect.width) / 2 + 80);
			const maxY = Math.max(24, (imageRect.height - stageRect.height) / 2 + 80);
			zoomState.x = clamp(zoomState.x, -maxX, maxX);
			zoomState.y = clamp(zoomState.y, -maxY, maxY);
		}

		function applyCarouselZoom() {
			constrainPan();
			carousel.image.style.transform = `translate(${zoomState.x}px, ${zoomState.y}px) scale(${zoomState.scale})`;
			carousel.image.classList.toggle("is-zoomed", zoomState.scale > 1.01);
			carousel.stage.classList.toggle("is-zoomed", zoomState.scale > 1.01);
			carousel.zoomValue.value = `${Math.round(zoomState.scale * 100)}%`;
		}

		function resetCarouselZoom() {
			zoomState.scale = 1;
			zoomState.x = 0;
			zoomState.y = 0;
			zoomState.dragging = false;
			carousel.stage.classList.remove("is-panning");
			applyCarouselZoom();
		}

		function zoomCarouselAt(nextScale, originX, originY) {
			const scale = clamp(nextScale, zoomState.minScale, zoomState.maxScale);
			if (scale === zoomState.scale) return;

			const imageX = (originX - zoomState.x) / zoomState.scale;
			const imageY = (originY - zoomState.y) / zoomState.scale;
			zoomState.scale = scale;
			zoomState.x = originX - imageX * zoomState.scale;
			zoomState.y = originY - imageY * zoomState.scale;
			applyCarouselZoom();
		}

		function zoomCarouselFromCenter(nextScale) {
			const rect = carousel.stage.getBoundingClientRect();
			zoomCarouselAt(nextScale, rect.width / 2, rect.height / 2);
		}

		function showCarouselItem() {
			if (visibleIndexes.length === 0) return;

			const itemIndex = visibleIndexes[activeVisibleIndex];
			const item = galleryItems[itemIndex];
			if (!item) return;

			carousel.title.textContent = item.title || item.number || "Imagen";
			carousel.meta.textContent = `${getGroupLabel(item.group)} / ${activeVisibleIndex + 1} de ${visibleIndexes.length}`;
			carousel.image.src = item.url;
			carousel.image.alt = item.title || item.number || "Imagen";
			carousel.download.href = item.url;
			carousel.download.setAttribute("download", item.fileName || item.number || "imagen");
			carousel.prev.disabled = visibleIndexes.length <= 1;
			carousel.next.disabled = visibleIndexes.length <= 1;
			resetCarouselZoom();
		}

		function openCarousel(index) {
			visibleIndexes = getVisibleIndexes();
			if (visibleIndexes.length === 0) return;

			activeVisibleIndex = Math.max(0, visibleIndexes.indexOf(index));
			carousel.overlay.hidden = false;
			document.body.classList.add("gallery-carousel-open");
			showCarouselItem();
			carousel.close.focus();
		}

		function closeCarousel() {
			carousel.overlay.hidden = true;
			document.body.classList.remove("gallery-carousel-open");
			carousel.image.removeAttribute("src");
			resetCarouselZoom();
		}

		function moveCarousel(step) {
			if (carousel.overlay.hidden || visibleIndexes.length === 0) return;

			activeVisibleIndex = (activeVisibleIndex + step + visibleIndexes.length) % visibleIndexes.length;
			showCarouselItem();
		}

		function applySearch() {
			const query = normalizeSearch(searchInput.value);
			const cards = Array.from(document.querySelectorAll(".gallery-card"));
			let visible = 0;

			for (const card of cards) {
				const matches = !query || card.dataset.number.toLowerCase().includes(query);
				card.hidden = !matches;
				if (matches) visible += 1;
			}

			readout.textContent = formatCount(visible, "resultado", "resultados");
			updateSelectionControls();
		}

		fetchManifest(manifestUrl)
			.then(manifest => {
				const groups = manifest.groups || {};
				const panoramics = Array.isArray(groups.panoramicas) ? groups.panoramicas : [];
				const drone = Array.isArray(groups.drone) ? groups.drone : [];
				const total = panoramics.length + drone.length;
				galleryItems = [
					...panoramics.map(item => ({...item, group: "panoramicas"})),
					...drone.map(item => ({...item, group: "drone"}))
				].map(item => ({
					...item,
					url: resolveResourceUrl(manifestUrl, item.file),
					fileName: item.file?.split("/").pop()
				}));

				imageCount.textContent = String(total);
				panoramicCount.textContent = formatCount(panoramics.length, "imagen", "imagenes");
				droneCount.textContent = formatCount(drone.length, "imagen", "imagenes");

				if (panoramics.length === 0) {
					setEmptyState(panoramicGallery, panoramicGallery.dataset.emptyLabel);
				} else {
					panoramicGallery.replaceChildren(...panoramics.map((item, index) => renderImageCard(item, "panoramicas", manifestUrl, index)));
				}

				if (drone.length === 0) {
					setEmptyState(droneGallery, droneGallery.dataset.emptyLabel);
				} else {
					droneGallery.replaceChildren(...drone.map((item, index) => renderImageCard(item, "drone", manifestUrl, panoramics.length + index)));
				}

				if (lazyImageObserver) lazyImageObserver.disconnect();
				lazyImageObserver = observeGalleryImages(document);

				document.querySelectorAll(".gallery-card-button").forEach(button => {
					button.addEventListener("click", () => {
						const card = button.closest(".gallery-card");
						openCarousel(Number(card.dataset.galleryIndex));
					});
				});

				document.querySelectorAll("[data-gallery-select]").forEach(input => {
					input.addEventListener("change", updateSelectionControls);
				});

				if (selectVisibleButton) {
					selectVisibleButton.addEventListener("click", () => {
						const visible = new Set(getVisibleIndexes());
						document.querySelectorAll("[data-gallery-select]").forEach(input => {
							input.checked = visible.has(Number(input.dataset.gallerySelect));
						});
						if (downloadStatus) downloadStatus.textContent = `${visible.size} imagenes seleccionadas.`;
						updateSelectionControls();
					});
				}

				if (clearSelectedButton) {
					clearSelectedButton.addEventListener("click", () => {
						document.querySelectorAll("[data-gallery-select]").forEach(input => {
							input.checked = false;
						});
						if (downloadStatus) downloadStatus.textContent = "Seleccion limpia.";
						updateSelectionControls();
					});
				}

				if (downloadSelectedButton) {
					downloadSelectedButton.addEventListener("click", () => {
						downloadFiles(filesFromIndexes(getSelectedIndexes()), {
							statusElement: downloadStatus,
							label: "imagenes seleccionadas"
						});
					});
				}

				if (downloadVisibleButton) {
					downloadVisibleButton.addEventListener("click", () => {
						downloadFiles(filesFromIndexes(getVisibleIndexes()), {
							statusElement: downloadStatus,
							label: "imagenes visibles"
						});
					});
				}

				if (downloadAllButton) {
					downloadAllButton.addEventListener("click", () => {
						downloadFiles(filesFromIndexes(galleryItems.map((_, index) => index)), {
							statusElement: downloadStatus,
							label: "imagenes"
						});
					});
				}

				searchInput.addEventListener("input", applySearch);
				carousel.close.addEventListener("click", closeCarousel);
				carousel.prev.addEventListener("click", () => moveCarousel(-1));
				carousel.next.addEventListener("click", () => moveCarousel(1));
				carousel.zoomIn.addEventListener("click", () => zoomCarouselFromCenter(zoomState.scale * 1.25));
				carousel.zoomOut.addEventListener("click", () => zoomCarouselFromCenter(zoomState.scale / 1.25));
				carousel.zoomReset.addEventListener("click", resetCarouselZoom);
				carousel.stage.addEventListener("wheel", event => {
					event.preventDefault();
					const rect = carousel.stage.getBoundingClientRect();
					const factor = Math.exp(-event.deltaY * 0.0012);
					zoomCarouselAt(zoomState.scale * factor, event.clientX - rect.left, event.clientY - rect.top);
				}, {passive: false});
				carousel.stage.addEventListener("pointerdown", event => {
					if (event.button !== 0 || zoomState.scale <= 1.01) return;
					zoomState.dragging = true;
					zoomState.lastX = event.clientX;
					zoomState.lastY = event.clientY;
					carousel.stage.classList.add("is-panning");
					carousel.stage.setPointerCapture(event.pointerId);
				});
				carousel.stage.addEventListener("pointermove", event => {
					if (!zoomState.dragging) return;
					const dx = event.clientX - zoomState.lastX;
					const dy = event.clientY - zoomState.lastY;
					zoomState.lastX = event.clientX;
					zoomState.lastY = event.clientY;
					zoomState.x += dx;
					zoomState.y += dy;
					applyCarouselZoom();
				});
				function stopCarouselPanning(event) {
					zoomState.dragging = false;
					carousel.stage.classList.remove("is-panning");
					if (event && carousel.stage.hasPointerCapture(event.pointerId)) {
						carousel.stage.releasePointerCapture(event.pointerId);
					}
				}
				carousel.stage.addEventListener("pointerup", stopCarouselPanning);
				carousel.stage.addEventListener("pointercancel", stopCarouselPanning);
				carousel.image.addEventListener("dblclick", event => {
					const rect = carousel.stage.getBoundingClientRect();
					const nextScale = zoomState.scale > 1.01 ? 1 : 2;
					zoomCarouselAt(nextScale, event.clientX - rect.left, event.clientY - rect.top);
				});
				carousel.overlay.addEventListener("click", event => {
					if (event.target === carousel.overlay) closeCarousel();
				});
				document.addEventListener("keydown", event => {
					if (carousel.overlay.hidden) return;
					if (event.key === "Escape") closeCarousel();
					if (event.key === "ArrowLeft") moveCarousel(-1);
					if (event.key === "ArrowRight") moveCarousel(1);
					if (event.key === "+" || event.key === "=") zoomCarouselFromCenter(zoomState.scale * 1.25);
					if (event.key === "-") zoomCarouselFromCenter(zoomState.scale / 1.25);
					if (event.key === "0") resetCarouselZoom();
				});
				applySearch();
			})
			.catch(error => {
				console.error(error);
				imageCount.textContent = "0";
				setEmptyState(panoramicGallery, "No se pudo cargar el manifest de imagenes.");
				setEmptyState(droneGallery, "Revise resources/imagenes/manifest.json.");
				readout.textContent = "0 resultados";
			});
	}

	document.addEventListener("DOMContentLoaded", syncNavbarHeight);

	window.JBCProjectUI = {
		downloadFiles,
		initRasterViewer,
		initPublishedDocuments,
		initPublishedImageGallery
	};
})();
