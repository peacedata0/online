/* -*- js-indent-level: 8 -*- */
/*
 *  L.AnnotationManager
 */

/* global $ */

L.AnnotationManager = L.Class.extend({
	options: {
		marginX: 40,
		marginY: 10,
		offset: 5,
		extraSize: L.point(290, 0)
	},

	initialize: function (map, options) {
		this._map = map;
		this._items = [];
		this._selected = null;
		L.setOptions(this, options);
		this._arrow = L.polyline([], {color: 'darkblue', weight: 1});
		this._map.on('zoomend', this._onAnnotationZoom, this);
		this._map.on('AnnotationCancel', this._onAnnotationCancel, this);
		this._map.on('AnnotationClick', this._onAnnotationClick, this);
		this._map.on('AnnotationReply', this._onAnnotationReply, this);
		this._map.on('AnnotationSave', this._onAnnotationSave, this);
		this._map.on('RedlineAccept', this._onRedlineAccept, this);
		this._map.on('RedlineReject', this._onRedlineReject, this);

		this._scaleFactor = 1;
	},

	// Remove only text comments from the document (excluding change tracking comments)
	clear: function () {
		var it = 0;
		while (it < this._items.length) {
			if (!this._items[it].trackchange) {
				this._map.removeLayer(this._items[it]);
				this._items.splice(it, 1);
			} else {
				it++;
			}
		}
		this._selected = null;
		this._map.removeLayer(this._arrow);
	},

	// Remove only change tracking comments from the document
	clearChanges: function() {
		var it = 0;
		while (it < this._items.length) {
			if (this._items[it].trackchange) {
				this._map.removeLayer(this._items[it]);
				this._items.splice(it, 1);
			} else {
				it++;
			}
		}
	},

	adjustComment: function(comment) {
		var rectangles, color, viewId;
		comment.trackchange = false;
		rectangles = L.PolyUtil.rectanglesToPolygons(L.LOUtil.stringToRectangles(comment.textRange || comment.anchorPos), this._map._docLayer);
		comment.anchorPos = L.LOUtil.stringToBounds(comment.anchorPos);
		comment.anchorPix = this._map._docLayer._twipsToPixels(comment.anchorPos.min);
		viewId = this._map.getViewId(comment.author);
		color = viewId >= 0 ? L.LOUtil.rgbToHex(this._map.getViewColor(viewId)) : '#43ACE8';
		if (rectangles.length > 0) {
			comment.textSelected = L.polygon(rectangles, {
				pointerEvents: 'all',
				interactive: false,
				fillColor: color,
				fillOpacity: 0.25,
				weight: 2,
				opacity: 0.25
			});
			comment.textSelected.addEventParent(this._map);
			L.DomEvent.on(comment.textSelected, 'contextmenu', L.DomEvent.preventDefault);
			comment.textSelected.on('click', function() {
				this.selectById(comment.id);
			}, this);
		}
	},

	adjustRedLine: function(redline) {
		// All sane values ?
		if (!redline.textRange) {
			console.warn('Redline received has invalid textRange');
			return false;
		}

		// transform change tracking index into an id
		redline.id = 'change-' + redline.index;
		redline.anchorPos = L.LOUtil.stringToBounds(redline.textRange);
		redline.anchorPix = this._map._docLayer._twipsToPixels(redline.anchorPos.min);
		redline.trackchange = true;
		redline.text = redline.comment;
		var rectangles = L.PolyUtil.rectanglesToPolygons(L.LOUtil.stringToRectangles(redline.textRange), this._map._docLayer);
		if (rectangles.length > 0) {
			redline.textSelected = L.polygon(rectangles, {
				pointerEvents: 'all',
				interactive: false,
				fillOpacity: 0,
				opacity: 0
			});
			redline.textSelected.addEventParent(this._map);
			L.DomEvent.on(redline.textSelected, 'contextmenu', L.DomEvent.preventDefault);
			redline.textSelected.on('click', function() {
				this.selectById(redline.id);
			}, this);
		}

		return true;
	},

	// Fill normal comments in the documents
	fill: function (comments) {
		var comment;
		this.clear();
		// items contains redlines
		var ordered = !this._items.length;
		for (var index in comments) {
			comment = comments[index];
			this.adjustComment(comment);
			if (comment.author in this._map._viewInfoByUserName) {
				comment.avatar = this._map._viewInfoByUserName[comment.author].userextrainfo.avatar;
			}
			this._items.push(L.annotation(this._map.options.docBounds.getSouthEast(), comment).addTo(this._map));
		}
		if (this._items.length > 0) {
			if (!ordered) {
				this._items.sort(function(a, b) {
					return Math.abs(a._data.anchorPos.min.y) - Math.abs(b._data.anchorPos.min.y) ||
						Math.abs(a._data.anchorPos.min.x) - Math.abs(b._data.anchorPos.min.x);
				});
			}
			this.layout();
		}
	},

	fillChanges: function(redlines) {
		var changecomment;
		this.clearChanges();
		// items contains comments
		var ordered = !this._items.length;
		for (var idx in redlines) {
			changecomment = redlines[idx];
			if (!this.adjustRedLine(changecomment)) {
				// something wrong in this redline, skip this one
				continue;
			}
			if (changecomment.author in this._map._viewInfoByUserName) {
				changecomment.avatar = this._map._viewInfoByUserName[changecomment.author].userextrainfo.avatar;
			}
			this._items.push(L.annotation(this._map.options.docBounds.getSouthEast(), changecomment).addTo(this._map));
		}
		if (this._items.length > 0) {
			if (!ordered) {
				this._items.sort(function(a, b) {
					return Math.abs(a._data.anchorPos.min.y) - Math.abs(b._data.anchorPos.min.y) ||
						Math.abs(a._data.anchorPos.min.x) - Math.abs(b._data.anchorPos.min.x);
				});
			}
			this.layout();
		}
	},

	getItem: function (id) {
		for (var iterator in this._items) {
			if (this._items[iterator]._data.id === id) {
				return this._items[iterator];
			}
		}
		return null;
	},

	getIndexOf: function (id) {
		for (var index = 0; index < this._items.length; index++) {
			if (this._items[index]._data.id === id) {
				return index;
			}
		}
		return -1;
	},

	// Returns the root comment id of given id
	getRootIndexOf: function(id) {
		var index = this.getIndexOf(id);
		for (var idx = index - 1;
			     idx >=0 && this._items[idx]._data.id === this._items[idx + 1]._data.parent;
			     idx--)
		{
			index = idx;
		}

		return index;
	},

	// Returns the last comment id of comment thread containing the given id
	getLastChildIndexOf: function(id) {
		var index = this.getIndexOf(id);
		for (var idx = index + 1;
		     idx < this._items.length && this._items[idx]._data.parent === this._items[idx - 1]._data.id;
		     idx++)
		{
			index = idx;
		}

		return index;
	},

	removeItem: function (id) {
		var annotation;
		for (var iterator in this._items) {
			annotation = this._items[iterator];
			if (annotation._data.id === id) {
				this._items.splice(iterator, 1);
				return annotation;
			}
		}
	},

	unselect: function () {
		if (this._selected) {
			this._selected = null;
			this.update();
		}
	},

	select: function (annotation) {
		if (annotation) {
			// Select the root comment
			var idx = this.getRootIndexOf(annotation._data.id);
			this._selected = this._items[idx];
			this.update();
		}
	},

	selectById: function(commentId) {
		var idx = this.getRootIndexOf(commentId);
		this._selected = this._items[idx];
		this.update();
	},

	update: function () {
		if (!this._selected) {
			this._map.removeLayer(this._arrow);
		}
		this.layout();
	},

	updateDocBounds: function () {
		if (this._items.length === 0) {
			this._map.fire('updatemaxbounds', {sizeChanged: true});
		}
	},

	layoutUp: function (commentThread, latLng, layoutBounds) {
		if (commentThread.length <= 0)
			return;

		(new L.PosAnimation()).run(commentThread[0]._container, this._map.latLngToLayerPoint(latLng));
		commentThread[0].setLatLng(latLng);
		var bounds = commentThread[0].getBounds();
		var idx = 1;
		while (idx < commentThread.length) {
			bounds.extend(bounds.max.add([0, commentThread[idx].getBounds().getSize().y]));
			idx++;
		}

		var pt;
		if (layoutBounds.intersects(bounds)) {
			layoutBounds.extend(layoutBounds.min.subtract([0, bounds.getSize().y]));
			pt = layoutBounds.min;
		} else {
			pt = bounds.min;
			layoutBounds.extend(bounds.min);
		}
		layoutBounds.extend(layoutBounds.min.subtract([0, this.options.marginY]));

		idx = 0;
		for (idx = 0; idx < commentThread.length; ++idx) {
			latLng = this._map.layerPointToLatLng(pt);
			(new L.PosAnimation()).run(commentThread[idx]._container, this._map.latLngToLayerPoint(latLng));
			commentThread[idx].setLatLng(latLng);
			commentThread[idx].show();

			var commentBounds = commentThread[idx].getBounds();
			pt = pt.add([0, commentBounds.getSize().y]);
		}
	},

	layoutDown: function (commentThread, latLng, layoutBounds) {
		if (commentThread.length <= 0)
			return;

		(new L.PosAnimation()).run(commentThread[0]._container, this._map.latLngToLayerPoint(latLng));
		commentThread[0].setLatLng(latLng);
		var bounds = commentThread[0].getBounds();
		var idx = 1;
		while (idx < commentThread.length) {
			bounds.extend(bounds.max.add([0, commentThread[idx].getBounds().getSize().y]));
			idx++;
		}

		var pt;
		if (layoutBounds.intersects(bounds)) {
			pt = layoutBounds.getBottomLeft();
			layoutBounds.extend(layoutBounds.max.add([0, bounds.getSize().y]));
		} else {
			pt = bounds.min;
			layoutBounds.extend(bounds.max);
		}
		layoutBounds.extend(layoutBounds.max.add([0, this.options.marginY]));

		idx = 0;
		for (idx = 0; idx < commentThread.length; ++idx) {
			latLng = this._map.layerPointToLatLng(pt);
			(new L.PosAnimation()).run(commentThread[idx]._container, this._map.latLngToLayerPoint(latLng));
			commentThread[idx].setLatLng(latLng);
			commentThread[idx].show();

			var commentBounds = commentThread[idx].getBounds();
			pt = pt.add([0, commentBounds.getSize().y]);
		}
	},

	doLayout: function (zoom) {
		this._updateScaling();
		var docRight = this._map.project(this._map.options.docBounds.getNorthEast());
		var topRight = docRight.add(L.point(this.options.marginX, this.options.marginY));
		var latlng, layoutBounds, point, idx;
		if (this._selected) {
			var selectIndexFirst = this.getRootIndexOf(this._selected._data.id);
			var selectIndexLast = this.getLastChildIndexOf(this._selected._data.id);
			if (zoom) {
				this._items[selectIndexFirst]._data.anchorPix = this._map._docLayer._twipsToPixels(this._items[selectIndexFirst]._data.anchorPos.min);
			}

			var posX = topRight.x;
			var posY = this._items[selectIndexFirst]._data.anchorPix.y;
			point = this._map._docLayer._twipsToPixels(this._items[selectIndexFirst]._data.anchorPos.min);

			if (L.Browser.mobile) {
				var mapBoundsPx = this._map.getPixelBounds();
				var annotationBoundsPx = this._items[selectIndexFirst].getBounds();
				var annotationSize = annotationBoundsPx.getSize();
				var topLeftPoint = L.point(posX, posY);
				annotationBoundsPx = L.bounds(topLeftPoint, topLeftPoint.add(annotationSize));

				if (!mapBoundsPx.contains(annotationBoundsPx)) {
					var scrollX = 0, scrollY = 0, spacing = 16;

					if (annotationBoundsPx.min.x < mapBoundsPx.min.x) {
						scrollX = annotationBoundsPx.min.x - mapBoundsPx.min.x - spacing;
					} else if (annotationBoundsPx.max.x > mapBoundsPx.max.x) {
						scrollX = annotationBoundsPx.max.x - mapBoundsPx.max.x + spacing;
					}
					if (annotationBoundsPx.min.y < mapBoundsPx.min.y) {
						scrollY = annotationBoundsPx.min.y - mapBoundsPx.min.y + spacing;
					} else if (annotationBoundsPx.max.y > mapBoundsPx.max.y) {
						scrollY = annotationBoundsPx.max.y - mapBoundsPx.max.y - spacing;
					}
					scrollX = Math.round(scrollX);
					scrollY = Math.round(scrollY);
					posX -= scrollX;
					if (posX < mapBoundsPx.min.x)
						posX = Math.round(mapBoundsPx.min.x + spacing);
					posY -= scrollY;
					if (posY < mapBoundsPx.min.y)
						posY = Math.round(mapBoundsPx.min.y + spacing);
					if (posX < this._items[selectIndexFirst]._data.anchorPix.x + spacing) {
						var anchorPosMax = this._map._docLayer._twipsToPixels(this._items[selectIndexFirst]._data.anchorPos.max);
						var lineHeight = Math.round(anchorPosMax.y - this._items[selectIndexFirst]._data.anchorPix.y);
						posY += 2 * lineHeight;
						point.y += lineHeight;
					}
				}
			}

			// Draw arrow
			this._arrow.setLatLngs([this._map.unproject(point), this._map.unproject(L.point(posX, posY))]);
			this._map.addLayer(this._arrow);

			latlng = this._map.unproject(L.point(posX, posY));
			(new L.PosAnimation()).run(this._items[selectIndexFirst]._container, this._map.latLngToLayerPoint(latlng));
			this._items[selectIndexFirst].setLatLng(latlng);
			layoutBounds = this._items[selectIndexFirst].getBounds();

			// Adjust child comments too, if any
			for (idx = selectIndexFirst + 1; idx <= selectIndexLast; idx++) {
				if (zoom) {
					this._items[idx]._data.anchorPix = this._map._docLayer._twipsToPixels(this._items[idx]._data.anchorPos.min);
				}
				latlng = this._map.layerPointToLatLng(layoutBounds.getBottomLeft());
				(new L.PosAnimation()).run(this._items[idx]._container, layoutBounds.getBottomLeft());
				this._items[idx].setLatLng(latlng);

				var commentBounds = this._items[idx].getBounds();
				layoutBounds.extend(layoutBounds.max.add([0, commentBounds.getSize().y]));
			}

			layoutBounds.min = layoutBounds.min.add([this.options.marginX, 0]);
			layoutBounds.max = layoutBounds.max.add([this.options.marginX, 0]);
			layoutBounds.extend(layoutBounds.min.subtract([0, this.options.marginY]));
			layoutBounds.extend(layoutBounds.max.add([0, this.options.marginY]));
			for (idx = selectIndexFirst - 1; idx >= 0;) {
				var commentThread = [];
				var tmpIdx = idx;
				do {
					if (zoom) {
						this._items[idx]._data.anchorPix = this._map._docLayer._twipsToPixels(this._items[idx]._data.anchorPos.min);
					}
					commentThread.push(this._items[tmpIdx]);
					tmpIdx = tmpIdx - 1;
				} while (tmpIdx >= 0 && this._items[tmpIdx]._data.id === this._items[tmpIdx + 1]._data.parent);

				commentThread.reverse();
				// All will have some anchor position
				this.layoutUp(commentThread, this._map.unproject(L.point(topRight.x, commentThread[0]._data.anchorPix.y)), layoutBounds);
				idx = idx - commentThread.length;
			}
			for (idx = selectIndexLast + 1; idx < this._items.length;) {
				commentThread = [];
				tmpIdx = idx;
				do {
					if (zoom) {
						this._items[idx]._data.anchorPix = this._map._docLayer._twipsToPixels(this._items[idx]._data.anchorPos.min);
					}
					commentThread.push(this._items[tmpIdx]);
					tmpIdx = tmpIdx + 1;
				} while (tmpIdx < this._items.length && this._items[tmpIdx]._data.parent === this._items[tmpIdx - 1]._data.id);

				// All will have some anchor position
				this.layoutDown(commentThread, this._map.unproject(L.point(topRight.x, commentThread[0]._data.anchorPix.y)), layoutBounds);
				idx = idx + commentThread.length;
			}
			if (!this._selected.isEdit()) {
				this._selected.show();
			}
		} else {
			point = this._map.latLngToLayerPoint(this._map.unproject(topRight));
			layoutBounds = L.bounds(point, point);
			for (idx = 0; idx < this._items.length;) {
				commentThread = [];
				tmpIdx = idx;
				do {
					if (zoom) {
						this._items[tmpIdx]._data.anchorPix = this._map._docLayer._twipsToPixels(this._items[tmpIdx]._data.anchorPos.min);
					}
					commentThread.push(this._items[tmpIdx]);
					tmpIdx = tmpIdx + 1;
				} while (tmpIdx < this._items.length && this._items[tmpIdx]._data.parent === this._items[tmpIdx - 1]._data.id);

				this.layoutDown(commentThread, this._map.unproject(L.point(topRight.x, commentThread[0]._data.anchorPix.y)), layoutBounds);
				idx = idx + commentThread.length;
			}
		}
	},

	layout: function (zoom) {
		if (zoom)
			this.doLayout(zoom);
		else if (!this._layoutTimer) {
			var me = this;
			me._layoutTimer = setTimeout(function() {
				delete me._layoutTimer;
				me.doLayout(zoom);
			}, 250 /* ms */);
		} // else - avoid excessive re-layout

	},

	add: function (comment) {
		var annotation = L.annotation(this._map._docLayer._twipsToLatLng(comment.anchorPos.getTopRight()), comment,
			comment.id === 'new' ? {noMenu: true} : {}).addTo(this._map);
		if (comment.parent && comment.parent > '0') {
			var parentIdx = this.getIndexOf(comment.parent);
			this._items.splice(parentIdx + 1, 0, annotation);
		} else {
			this._items.push(annotation);
		}
		this._items.sort(function(a, b) {
			return Math.abs(a._data.anchorPos.min.y) - Math.abs(b._data.anchorPos.min.y) ||
				Math.abs(a._data.anchorPos.min.x) - Math.abs(b._data.anchorPos.min.x);
		});
		return annotation;
	},

	edit: function (comment) {
		var annotation = L.annotation(this._map._docLayer._twipsToLatLng(comment.anchorPos.getTopRight()), comment).addTo(this._map);
		annotation.edit();
		annotation.focus();
	},

	modify: function (annotation) {
		annotation.edit();
		this.select(annotation);
		annotation.focus();
	},

	reply: function (annotation) {
		annotation.reply();
		this.select(annotation);
		annotation.focus();
	},

	remove: function (id) {
		var comment = {
			Id: {
				type: 'string',
				value: id
			}
		};
		this._map.sendUnoCommand('.uno:DeleteComment', comment);
		this.unselect();
		this._map.focus();
	},

	_onRedlineAccept: function(e) {
		var command = {
			AcceptTrackedChange: {
				type: 'unsigned short',
				value: e.id.substring('change-'.length)
			}
		};
		this._map.sendUnoCommand('.uno:AcceptTrackedChange', command);
		this.unselect();
		this._map.focus();
	},

	_onRedlineReject: function(e) {
		var command = {
			RejectTrackedChange: {
				type: 'unsigned short',
				value: e.id.substring('change-'.length)
			}
		};
		this._map.sendUnoCommand('.uno:RejectTrackedChange', command);
		this.unselect();
		this._map.focus();
	},

	// Adjust parent-child relationship, if required, after `comment` is added
	adjustParentAdd: function(comment) {
		if (comment.parent && comment.parent > '0') {
			var parentIdx = this.getIndexOf(comment.parent);
			if (parentIdx === -1) {
				console.warn('adjustParentAdd: No parent comment to attach received comment to. ' +
				             'Parent comment ID sought is :' + comment.parent + ' for current comment with ID : ' + comment.id);
				return;
			}
			if (this._items[parentIdx + 1] && this._items[parentIdx + 1]._data.parent === this._items[parentIdx]._data.id) {
				this._items[parentIdx + 1]._data.parent = comment.id;
			}
		}
	},

	// Adjust parent-child relationship, if required, after `comment` is removed
	adjustParentRemove: function(comment) {
		var newId = '0';
		var parentIdx = this.getIndexOf(comment._data.parent);
		if (parentIdx >= 0) {
			newId = this._items[parentIdx]._data.id;
		}
		var currentIdx = this.getIndexOf(comment._data.id);
		if (this._items[currentIdx + 1] && this._items[currentIdx].parentOf(this._items[currentIdx + 1])) {
			this._items[currentIdx + 1]._data.parent = newId;
		}
	},

	onACKComment: function (obj) {
		var id;
		var changetrack = obj.redline ? true : false;
		var action = changetrack ? obj.redline.action : obj.comment.action;

		if (changetrack && obj.redline.author in this._map._viewInfoByUserName) {
			obj.redline.avatar = this._map._viewInfoByUserName[obj.redline.author].userextrainfo.avatar;
		}
		else if (!changetrack && obj.comment.author in this._map._viewInfoByUserName) {
			obj.comment.avatar = this._map._viewInfoByUserName[obj.comment.author].userextrainfo.avatar;
		}

		if (action === 'Add') {
			if (changetrack) {
				if (!this.adjustRedLine(obj.redline)) {
					// something wrong in this redline
					return;
				}
				this.add(obj.redline);
			} else {
				this.adjustComment(obj.comment);
				this.adjustParentAdd(obj.comment);
				this.add(obj.comment);
			}
			if (this._selected && !this._selected.isEdit()) {
				this._map.focus();
			}
			this.layout();
		} else if (action === 'Remove') {
			id = changetrack ? 'change-' + obj.redline.index : obj.comment.id;
			var removed = this.getItem(id);
			if (removed) {
				this.adjustParentRemove(removed);
				this._map.removeLayer(this.removeItem(id));
				if (this._selected === removed) {
					this.unselect();
				} else {
					this.layout();
				}
			}
			this.updateDocBounds();
		} else if (action === 'Modify') {
			id = changetrack ? 'change-' + obj.redline.index : obj.comment.id;
			var modified = this.getItem(id);
			if (modified) {
				var modifiedObj;
				if (changetrack) {
					if (!this.adjustRedLine(obj.redline)) {
						// something wrong in this redline
						return;
					}
					modifiedObj = obj.redline;
				} else {
					this.adjustComment(obj.comment);
					modifiedObj = obj.comment;
				}
				modified.setData(modifiedObj);
				modified.update();
				this.update();
			}
		}
	},

	_onAnnotationCancel: function (e) {
		if (e.annotation._data.id === 'new') {
			this._map.removeLayer(this.removeItem(e.annotation._data.id));
			this.updateDocBounds();
		}
		if (this._selected === e.annotation) {
			this.unselect();
		} else {
			this.layout();
		}
		this._map.focus();
	},

	_onAnnotationClick: function (e) {
		this.select(e.annotation);
	},

	_onAnnotationReply: function (e) {
		var comment = {
			Id: {
				type: 'string',
				value: e.annotation._data.id
			},
			Text: {
				type: 'string',
				value: e.annotation._data.reply
			}
		};
		this._map.sendUnoCommand('.uno:ReplyComment', comment);
		this.unselect();
		this._map.focus();
	},

	_onAnnotationSave: function (e) {
		var comment;
		if (e.annotation._data.id === 'new') {
			comment = {
				Text: {
					type: 'string',
					value: e.annotation._data.text
				},
				Author: {
					type: 'string',
					value: e.annotation._data.author
				}
			};
			this._map.sendUnoCommand('.uno:InsertAnnotation', comment);
			this._map.removeLayer(this.removeItem(e.annotation._data.id));
		} else if (e.annotation._data.trackchange) {
			comment = {
				ChangeTrackingId: {
					type: 'long',
					value: e.annotation._data.index
				},
				Text: {
					type: 'string',
					value: e.annotation._data.text
				}
			};
			this._map.sendUnoCommand('.uno:CommentChangeTracking', comment);
		} else {
			comment = {
				Id: {
					type: 'string',
					value: e.annotation._data.id
				},
				Text: {
					type: 'string',
					value: e.annotation._data.text
				}
			};
			this._map.sendUnoCommand('.uno:EditAnnotation', comment);
		}
		this.unselect();
		this._map.focus();
	},

	_onAnnotationZoom: function () {
		this._map.fire('updatemaxbounds', {sizeChanged: true});
		this.layout(true);
	},

	_getScaleFactor: function () {
		var scaleFactor = 1.0 / this._map.getZoomScale(this._map.options.zoom, this._map._zoom);
		if (scaleFactor < 0.4)
			scaleFactor = 0.4;
		else if (scaleFactor < 0.6)
			scaleFactor = 0.6 - (0.6 - scaleFactor) / 2.0;
		else if (scaleFactor < 0.8)
			scaleFactor = 0.8;
		else if (scaleFactor <= 2)
			scaleFactor = 1;
		else if (scaleFactor > 2) {
			scaleFactor = 1 + (scaleFactor - 1) / 10.0;
			if (scaleFactor > 1.5)
				scaleFactor = 1.5;
		}
		return scaleFactor;
	},

	_updateScaling: function () {
		if (!L.Browser.mobile || this._items.length === 0)
			return;

		var initNeeded = (this._initialLayoutData === undefined);
		var contentWrapperClass = $('.loleaflet-annotation-content-wrapper');
		if (initNeeded && contentWrapperClass.length > 0) {
			var userlineClass = $('.loleaflet-annotation-userline');
			var contentAuthor = $('.loleaflet-annotation-content-author');
			var dateClass = $('.loleaflet-annotation-date');

			this._initialLayoutData = {
				wrapperWidth: parseInt(contentWrapperClass.css('width')),
				wrapperFontSize: parseInt(contentWrapperClass.css('font-size')),
				authorLineWidth: parseInt(userlineClass.css('width')),
				authorLineHeight: parseInt(userlineClass.css('height')),
				authorContentHeight: parseInt(contentAuthor.css('height')),
				dateFontSize: parseInt(dateClass.css('font-size')),
			};
		}

		var menuClass = $('.loleaflet-annotation-menu');
		if ((this._initialLayoutData.menuWidth === undefined) && menuClass.length > 0) {
			this._initialLayoutData.menuWidth = parseInt(menuClass.css('width'));
			this._initialLayoutData.menuHeight = parseInt(menuClass.css('height'));
		}

		var scaleFactor = this._getScaleFactor();
		var idx;
		if (this._selected) {
			var selectIndexFirst = this.getRootIndexOf(this._selected._data.id);
			var selectIndexLast = this.getLastChildIndexOf(this._selected._data.id);
			for (idx = 0; idx < this._items.length; idx++) {
				if (idx < selectIndexFirst || idx >  selectIndexLast) {
					this._items[idx]._updateScaling(scaleFactor, this._initialLayoutData);
				}
				else {
					this._items[idx]._updateScaling(1, this._initialLayoutData);
				}
			}
		}
		else {
			for (idx = 0; idx < this._items.length; idx++) {
				this._items[idx]._updateScaling(scaleFactor, this._initialLayoutData);
			}
		}
	}
});


L.Map.include({
	insertComment: function() {
		this._docLayer.newAnnotation({
			text: '',
			textrange: '',
			author: this.getViewName(this._docLayer._viewId),
			dateTime: new Date().toDateString(),
			id: 'new' // 'new' only when added by us
		});
	}
});


L.annotationManager = function (map, options) {
	return new L.AnnotationManager(map, options);
};
