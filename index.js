const defaults = {
    node: {
        stroke_color: "#000",
        width: 128,
        max_width: 512,
        height: 32,
        spacing: { h: 10, w: 30 },
    },
    fill_color: "#dddddd",
    fill_root_color: "#668BFA",
    stroke_color: "#000000",
    stroke_selected_color: "#FF0000",
};
const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SAVES_STORAGE_KEY = "saves";
const ASSUMED_CHAR_WIDTH = 10;
const ASSUMED_CHAR_HEIGHT = 24;
const NAVBAR_HEIGHT = 64;
const CORNER_RADIUS = 10;
const STROKE_WIDTH = 2;
const PADDING = 12;
const LINE_HEIGHT = 1.2;
const NODE_ID_ATTR = "data-node-id";
function assert(expr) {
    if (!!expr) {
        throw TypeError("Assert failed", { "cause": arguments.callee });
    }
}
function _getId(start = 1) {
    let i = start;
    return () => i++;
}
let getId = _getId();
let app_state = {
    root_node: undefined,
    root_x: 0,
    root_y: 0,
    scale: 1,
    projects: [],
    saves: [],
    view_box: {
        width: 2000,
        height: 1000,
    },
    selected_node_id: 0,
    mode: "navigate",
    all_nodes: {}, // id: node
};
function nodeCreateDefault(parent) {
    const new_node = {
        id: getId(),
        pr: parent,
        co: "",
        changed: true,
        ch: [],
        text_dim: { w: 0, h: 0 },
        branch_dim: { w: 0, h: 0 },
    };
    if (parent) {
        parent.ch.push(new_node);
    }
    app_state.all_nodes[new_node.id] = new_node;
    return new_node;
}
function nodeIsRoot(node) {
    return node.pr == null;
}
function nodeRemove(node) {
    const parent_node = node.pr;
    if (parent_node) {
        const child_idx = parent_node.ch.findIndex((it) => it === node);
        node.ch.forEach(v => v.pr = parent_node);
        parent_node.ch.splice(child_idx, 1, ...node.ch);
        delete app_state.all_nodes[node.id];
    }
}
function nodeAddParent(node) {
    const parent_node = node.pr;
    const new_node = nodeCreateDefault(null);
    new_node.pr = parent_node;
    node.pr = new_node;
    new_node.ch = [node];
    if (parent_node) {
        const node_idx = parent_node.ch.findIndex((it) => it === node);
        parent_node.ch.splice(node_idx, 1, new_node);
    }
    return new_node;
}
let textSizeCanvas = document.createElement("canvas");
function getTextSize(text, font) {
    const canvas = textSizeCanvas;
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return {
        w: metrics.width,
        h: metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent,
    };
}
function getCssStyle(element, prop) {
    return window.getComputedStyle(element, null).getPropertyValue(prop);
}
function getCanvasFont(el = document.body) {
    const fontWeight = getCssStyle(el, "font-weight") || "normal";
    const fontSize = getCssStyle(el, "font-size") || "16px";
    const fontFamily = getCssStyle(el, "font-family") || "Times New Roman";
    return `${fontWeight} ${fontSize} ${fontFamily}`;
}
function nodeCalcSize(node) {
    if (node.changed === false) {
        return node.text_dim;
    }
    node.changed = false;
    const lines = node.co.split("\n");
    let { line_width, line_height } = lines.reduce((a, c) => {
        const lineDim = getTextSize(c, getCanvasFont());
        a.line_width = Math.max(lineDim.w, a.line_width);
        if (a.line_height == 0) {
            // Only record the first line's height
            a.line_height = lineDim.h;
        }
        return a;
    }, { line_width: 0, line_height: 0 });
    if (lines.length > 1) {
        line_height += lines.length * LINE_HEIGHT * parseFloat(getComputedStyle(document.body).fontSize);
    }
    node.text_dim = { w: line_width, h: line_height };
    // node.text_dim = lineDim
    return node.text_dim;
}
function viewBoxString() {
    const vb = app_state.view_box;
    return `0 0 ${vb.width} ${vb.height}`;
}
function render() {
    const svg = document.getElementById("main-svg");
    const command_mode = document.getElementById("command-mode");
    const root_node = app_state.root_node;
    command_mode.innerText = app_state.mode;
    calcBranchSizeRecursive(root_node);
    app_state.view_box.width = root_node.branch_dim.w + defaults.node.spacing.w;
    app_state.view_box.height = root_node.branch_dim.h + defaults.node.spacing.h;
    // svg.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    svg.setAttribute("viewBox", viewBoxString());
    svg.setAttribute("style", `width: ${app_state.view_box.width}px; height: ${app_state.view_box.height}px; font: ${getCanvasFont()}`);
    const root_node_pos = { x: defaults.node.spacing.w + root_node.text_dim.w / 2, y: root_node.branch_dim.h / 2 };
    svg.replaceChildren();
    renderNode(svg, app_state.root_node, root_node_pos, root_node_pos);
    const import_json_input = document.getElementById("import-json-input");
    import_json_input.onchange = importJSONFromFile;
}
function toEditMode(current_node) {
    app_state.mode = 'edit';
    render();
    setTimeout(() => scrollIntoView(current_node), 0);
    const box = current_node.elem.getBoundingClientRect();
    const tmp = document.getElementById("node-text-arena");
    tmp.style.display = "block";
    tmp.style.top = `${box.top}px`;
    tmp.style.left = `${box.left}px`;
    tmp.style.minWidth = `${box.width}px`;
    tmp.style.minHeight = `${box.height}px`;
    tmp.innerText = current_node.co;
    document.body.appendChild(tmp);
    tmp.focus();
    // Select all content
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(tmp);
    selection.removeAllRanges();
    selection.addRange(range);
    tmp.onblur = (e) => {
        app_state.mode = 'navigate';
        current_node.co = tmp.innerText.trim();
        current_node.changed = true;
        render();
        tmp.style.display = "none";
        setTimeout(() => scrollIntoView(current_node), 0);
        tmp.onblur = null;
    };
}
let handleControlHandlers = undefined;
function handleControl(e) {
    if (!handleControlHandlers) {
        function removeCurrentNode(current_node) {
            if (!nodeIsRoot(current_node)) {
                app_state.selected_node_id = current_node.pr.id;
                nodeRemove(current_node);
            }
        }
        handleControlHandlers = {
            Tab: (current_node, e) => {
                let tmp_node = undefined;
                if (e.shiftKey) {
                    tmp_node = nodeAddParent(current_node);
                    tmp_node.co = `node ${tmp_node.id}`;
                    app_state.selected_node_id = tmp_node.id;
                }
                else {
                    tmp_node = nodeCreateDefault(current_node);
                    tmp_node.co = `node ${tmp_node.id}`;
                    app_state.selected_node_id = tmp_node.id;
                }
                toEditMode(tmp_node);
            },
            " ": toEditMode,
            i: toEditMode,
            a: toEditMode,
            o: (current_node) => {
                if (nodeIsRoot(current_node)) {
                    return;
                }
                const parent = current_node.pr;
                const new_node = nodeCreateDefault(null /* Insert child ourself */);
                new_node.pr = parent;
                new_node.co = `node ${new_node.id}`;
                const current_node_pos = parent.ch.findIndex(v => v === current_node);
                parent.ch.splice(current_node_pos + 1, 0, new_node);
                app_state.selected_node_id = new_node.id;
                toEditMode(new_node);
            },
            O: (current_node) => {
                if (nodeIsRoot(current_node)) {
                    return;
                }
                const parent = current_node.pr;
                const new_node = nodeCreateDefault(null /* Insert child ourself */);
                new_node.pr = parent;
                new_node.co = `node ${new_node.id}`;
                const current_node_pos = parent.ch.findIndex(v => v === current_node);
                if (current_node_pos == 0) {
                    parent.ch.unshift(new_node);
                }
                else {
                    parent.ch.splice(current_node_pos, 0, new_node);
                }
                app_state.selected_node_id = new_node.id;
                toEditMode(new_node);
            },
            h: (current_node) => {
                if (!nodeIsRoot(current_node)) {
                    app_state.selected_node_id = current_node.pr.id;
                }
            },
            j: (current_node) => {
                if (nodeIsRoot(current_node)) {
                    return;
                }
                const parent = current_node.pr;
                const idx = parent.ch.findIndex((it) => it === current_node);
                if (idx == -1) {
                    return;
                }
                if (idx == parent.ch.length - 1) {
                    app_state.selected_node_id = parent.ch[0].id;
                }
                else {
                    app_state.selected_node_id =
                        parent.ch[(idx + 1) % parent.ch.length].id;
                }
            },
            k: (current_node) => {
                if (nodeIsRoot(current_node)) {
                    return;
                }
                const parent = current_node.pr;
                const idx = parent.ch.findIndex((it) => it === current_node);
                if (idx === -1) {
                    return;
                }
                if (idx == 0) {
                    app_state.selected_node_id = parent.ch.at(-1).id;
                }
                else {
                    app_state.selected_node_id = parent.ch.at(idx - 1).id;
                }
            },
            l: (current_node) => {
                if (current_node.ch.length) {
                    app_state.selected_node_id = current_node.ch[0].id;
                }
            },
            x: removeCurrentNode,
            Backspace: removeCurrentNode,
            Delete: removeCurrentNode,
            s: (_, e) => { if (e.ctrlKey) {
                save();
            } }
        };
    }
    if (e.key in handleControlHandlers) {
        const current_node = app_state.all_nodes[app_state.selected_node_id];
        handleControlHandlers[e.key](current_node, e);
        e.preventDefault();
        render();
        const new_current_node = app_state.all_nodes[app_state.selected_node_id];
        setTimeout(() => scrollIntoView(new_current_node), 0);
    }
}
function main() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.id = "main-svg";
    svg.setAttribute("transform", "translate(-0.5 -0.5)");
    document.getElementById("main").appendChild(svg);
    document.getElementById("node-text-arena").addEventListener("keydown", e => {
        e.stopPropagation();
        switch (e.key) {
            case "Escape":
            case "Tab":
                e.preventDefault();
                e.stopPropagation();
                // @ts-expect-error
                e.currentTarget.blur();
                break;
        }
    });
    app_state.root_node = nodeCreateDefault(null);
    app_state.root_node.co = "Root node";
    app_state.root_node.changed = true;
    app_state.selected_node_id = app_state.root_node.id;
    setupUI();
    window.addEventListener("resize", () => (render()));
    window.addEventListener("keydown", handleControl);
    load();
    render();
}
function calcBranchSizeRecursive(node) {
    nodeCalcSize(node);
    let branch_dim = { w: 0, h: 0 };
    for (const child of node.ch) {
        const child_branch_dim = calcBranchSizeRecursive(child);
        branch_dim.h += child_branch_dim.h + defaults.node.spacing.h;
        branch_dim.w = Math.max(branch_dim.w, child_branch_dim.w);
    }
    branch_dim.h -= defaults.node.spacing.h;
    branch_dim.h = Math.max(branch_dim.h, node.text_dim.h + PADDING * 2);
    branch_dim.w += node.text_dim.w + PADDING * 2 + defaults.node.spacing.w;
    node.branch_dim = branch_dim;
    return branch_dim;
}
function renderNode(svg /*HTML SVG Elem*/, node = null, pos = { x: 0, y: 0 }, // Center
parent_pos = { x: 0, y: 0 } // Center
) {
    if (!node)
        node = app_state.root_node;
    const rendered_node = renderNode_(node, pos, parent_pos);
    if (rendered_node) {
        svg.appendChild(rendered_node);
    }
    pos.x += node.text_dim.w / 2 + PADDING;
    let child_pos = {
        x: pos.x + defaults.node.spacing.w + PADDING,
        y: pos.y - node.branch_dim.h / 2,
    };
    for (const child of node.ch) {
        child_pos.x += child.text_dim.w / 2;
        child_pos.y += child.branch_dim.h / 2;
        renderNode(svg, child, { ...child_pos }, { ...pos });
        child_pos.y += child.branch_dim.h / 2 + defaults.node.spacing.h;
        child_pos.x -= child.text_dim.w / 2;
    }
}
function setPos(elem /*SVG elem*/, x, y, w, h) {
    elem.setAttribute("x", x.toString());
    elem.setAttribute("y", y.toString());
    elem.setAttribute("width", w.toString());
    elem.setAttribute("height", h.toString());
}
function setAppearance(elem /*SVG elem*/, r, stroke, fill) {
    elem.setAttribute("rx", r.toString());
    elem.setAttribute("ry", r.toString());
    elem.setAttribute("stroke", stroke);
    elem.setAttribute("fill", fill);
    elem.setAttribute("stroke-width", STROKE_WIDTH.toString());
}
function cssVar(s) {
    return `var(--${s})`;
}
const main_section = document.getElementById("main");
function scrollIntoView(node, center = false) {
    // Firefox can't do this properly so we have to do it ourself
    // Source - https://stackoverflow.com/a/57658998
    // Posted by Nickolay
    // Retrieved 2026-01-28, License - CC BY-SA 4.0
    // { block: "top" } behavior:
    const el = node.elem;
    if (!el) {
        return;
    }
    let newScrollY = window.pageYOffset + el.getBoundingClientRect().top;
    let newScrollX = window.pageXOffset + el.getBoundingClientRect().left;
    // adjust to behave like { block: "center" }
    if (center) {
        newScrollY -= document.documentElement.clientHeight / 2;
        newScrollX -= document.documentElement.clientWidth / 2;
    }
    // console.log("Scrolling to: ", newScrollX, newScrollY, node)
    // main_section.scrollTo({
    //     top: newScrollY, left: newScrollX, behavior: "smooth",
    // });
}
function focusNode(e) {
    app_state.selected_node_id = Number(e.getAttribute(NODE_ID_ATTR));
    setTimeout(() => scrollIntoView(app_state.all_nodes[app_state.selected_node_id]), 0);
    render();
}
let renderNode_font = getCanvasFont();
function renderNode_(node, pos = { x: 0, y: 0 }, parent_pos = { x: 0, y: 0 }) {
    const line = node.text_dim;
    const node_width = line.w + 2 * PADDING;
    const node_height = line.h + 2 * PADDING;
    const node_x = pos.x - node_width / 2;
    const node_y = pos.y - node_height / 2;
    const fill_color = nodeIsRoot(node) ? defaults.fill_root_color : defaults.fill_color;
    const stroke_color = node.id == app_state.selected_node_id
        ? defaults.stroke_selected_color
        : defaults.stroke_color;
    let text_svg = undefined;
    let node_svg = undefined;
    let group_svg = undefined;
    let line_svg = undefined;
    if (node.elem) {
        group_svg = node.elem;
        text_svg = node.elem.getElementsByTagNameNS(SVG_NS, "text")[0];
        node_svg = node.elem.getElementsByTagNameNS(SVG_NS, "rect")[0];
        line_svg = node.elem.getElementsByTagNameNS(SVG_NS, "path")[0];
    }
    else {
        node_svg = document.createElementNS(SVG_NS, "rect");
        text_svg = document.createElementNS(SVG_NS, "text");
        group_svg = document.createElementNS(SVG_NS, "g");
        line_svg = document.createElementNS(SVG_NS, "path");
        group_svg.setAttribute(NODE_ID_ATTR, node.id.toString());
        let pending_click = undefined;
        group_svg.onclick = e => {
            if (pending_click) {
                clearTimeout(pending_click);
                pending_click = undefined;
            }
            switch (e.detail) {
                case 1:
                    let current_target = e.currentTarget;
                    pending_click = setTimeout(() => focusNode(current_target), 0);
                    break;
                case 2:
                    focusNode(e.currentTarget);
                    toEditMode(app_state.all_nodes[app_state.selected_node_id]);
                    break;
                default:
                    break;
            }
        };
        line_svg.setAttribute("fill", "none");
        line_svg.setAttribute("stroke", "#000000");
        line_svg.setAttribute("stroke-width", STROKE_WIDTH.toString());
        if (node.pr) {
            group_svg.appendChild(line_svg);
        }
        group_svg.appendChild(node_svg);
        group_svg.appendChild(text_svg);
    }
    if (line_svg) {
        line_svg.setAttribute("d", `M${parent_pos.x} ${parent_pos.y} L${node_x} ${pos.y}`);
    }
    setAppearance(node_svg, CORNER_RADIUS, stroke_color, fill_color);
    setPos(node_svg, node_x, node_y, node_width, node_height);
    const lines = node.co.split("\n");
    const text_x = node_x + PADDING;
    const text_y = node_y + node_height - PADDING - (lines.length - 1) * line.h / lines.length;
    let tmp = "";
    let acc_empty_line = 0;
    for (let i = 0; i < lines.length; i++) {
        if (!lines[i]) {
            acc_empty_line += 1;
        }
        else {
            if (i > 0) {
                acc_empty_line += 1;
            }
            tmp += `<tspan x="${node_x + PADDING}" dy="${acc_empty_line * LINE_HEIGHT}em">${lines[i]}</tspan>`;
            acc_empty_line = 0;
        }
    }
    text_svg.innerHTML = tmp;
    // text_svg.textContent = node.co
    text_svg.setAttribute("x", text_x.toString());
    text_svg.setAttribute("y", text_y.toString());
    node.elem = group_svg;
    return node.elem;
}
function serializeNode(node) {
    return {
        id: node.id,
        pr: node.pr?.id ?? null,
        co: node.co,
        bc: node.bc,
        tc: node.tc,
        ch: node.ch.map((v) => v.id),
    };
}
function toJson() {
    let serialized_nodes = Object.values(app_state.all_nodes).map(serializeNode);
    console.debug(serialized_nodes);
    return JSON.stringify(serialized_nodes);
}
function _serializedNodeToNNodeTmp(snode) {
    return {
        id: snode.id,
        pr: null,
        co: snode.co,
        changed: true,
        bc: snode.bc,
        tc: snode.tc,
        ch: [],
        elem: undefined,
        text_dim: { w: 0, h: 0 },
        branch_dim: { w: 0, h: 0 },
    };
}
function fromJson(json_) {
    try {
        let maxx = 0;
        let root_node_idx = null;
        const parsed = JSON.parse(json_);
        const tmp = parsed.map(_serializedNodeToNNodeTmp);
        const childs = {};
        // Populate childs and root_node_idx
        for (let i = 0; i < tmp.length; i++) {
            const nnode = tmp[i];
            maxx = Math.max(nnode.id, maxx);
            const snode = parsed[i];
            // app_state.all_nodes[snode.id] = nnode
            if (snode.pr === null) {
                root_node_idx = i;
            }
            if (snode.pr in childs) {
                childs[snode.pr].push(nnode);
            }
            else {
                childs[snode.pr] = [nnode];
            }
        }
        getId = _getId(maxx + 1);
        console.debug(childs);
        // Fix pr and ch
        for (let i = 0; i < tmp.length; i++) {
            if (parsed[i].id in childs) {
                childs[parsed[i].id].forEach(v => v.pr = tmp[i]);
                tmp[i].ch = childs[parsed[i].id];
            }
        }
        app_state.all_nodes = {};
        tmp.forEach(v => app_state.all_nodes[v.id] = v);
        return tmp[root_node_idx];
    }
    catch (e) {
        console.error(e);
        return null;
    }
}
function UIUpdateSavesOption() {
    const save_name = document.getElementById("save_name");
    const options = [];
    if (app_state.saves) {
        for (let i = 0; i < app_state.saves.length; i++) {
            let save = app_state.saves[i];
            options.push(new Option(save, save, false, false));
        }
    }
    save_name.replaceChildren(...options);
}
function UIUpdateProjectsOption() {
    const save_projs = document.getElementById("proj_names");
    const options = [];
    if (app_state.projects) {
        for (let i = 0; i < app_state.projects.length; i++) {
            let proj = app_state.projects[i];
            options.push(new Option(proj, proj, false, false));
        }
    }
    save_projs.replaceChildren(...options);
}
function getSaveKey(proj, name) {
    return `${proj}_${name}`;
}
function save() {
    const proj_name = document.getElementById("proj_name")
        .value;
    const save_name = new Date().toLocaleString();
    app_state.saves = [save_name].concat(app_state.saves);
    const proj_idx = app_state.projects.findIndex((it) => it == proj_name);
    if (proj_idx !== -1) {
        app_state.projects.splice(proj_idx, 1);
    }
    app_state.projects = [proj_name].concat(app_state.projects);
    UIUpdateSavesOption();
    UIUpdateProjectsOption();
    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(app_state.projects));
    localStorage.setItem(getSaveKey(SAVES_STORAGE_KEY, proj_name), JSON.stringify(app_state.saves));
    localStorage.setItem(getSaveKey(proj_name, save_name), toJson());
}
function load() {
    const proj_name = document.getElementById("proj_name")
        .value;
    const save_name = document.getElementById("save_name")
        .value;
    const loaded_root = fromJson(localStorage.getItem(getSaveKey(proj_name, save_name)) ?? "");
    if (loaded_root) {
        document.getElementsByTagName("svg")[0].replaceChildren();
        app_state.root_node = loaded_root;
        app_state.selected_node_id = app_state.root_node.id;
        render();
        UIUpdateSavesOption();
        UIUpdateProjectsOption();
    }
}
function changeSaves() {
    const proj_name = document.getElementById("proj_name")
        .value;
    app_state.saves =
        JSON.parse(localStorage.getItem(getSaveKey(SAVES_STORAGE_KEY, proj_name)) ?? "[]") ?? [];
    UIUpdateSavesOption();
}
function setupUI() {
    app_state.projects =
        JSON.parse(localStorage.getItem(SAVES_STORAGE_KEY) ?? "[]") ?? [];
    const default_project = app_state.projects[0] ?? "Default project";
    app_state.saves =
        JSON.parse(localStorage.getItem(getSaveKey(SAVES_STORAGE_KEY, default_project)) ?? "[]") ?? [];
    const proj_name = document.getElementById("proj_name");
    proj_name.value = default_project;
    proj_name.addEventListener("focusout", changeSaves);
    changeSaves();
    UIUpdateSavesOption();
    UIUpdateProjectsOption();
}
function downloadData(name, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mindmap_" + new Date().toLocaleString();
    link.click();
    URL.revokeObjectURL(url);
}
function exportSVG() {
    const elem = document.getElementById("main-svg");
    const svgData = new XMLSerializer().serializeToString(elem);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    downloadData("mindmap_" + new Date().toLocaleString(), blob);
}
function exportJSON() {
    const json_data = toJson();
    const blob = new Blob([json_data], { type: "application/json" });
    downloadData("mindmap_" + new Date().toLocaleString(), blob);
}
function importJSON() {
    if (confirm("Do you want to save the current mindmap?")) {
        save();
    }
    document.getElementById("import-json-input").click();
}
function importJSONFromFile(e) {
    const input = e.target;
    const file = input.files[0];
    // setting up the reader
    var reader = new FileReader();
    reader.readAsText(file);
    // here we tell the reader what to do when it's done reading...
    reader.onload = readerEvent => {
        const content = readerEvent.target.result; // this is the content!
        const loaded_root = fromJson(content.toString());
        if (loaded_root) {
            document.getElementsByTagName("svg")[0].replaceChildren();
            app_state.root_node = loaded_root;
            app_state.selected_node_id = app_state.root_node.id;
            render();
        }
    };
}
main();
//# sourceMappingURL=index.js.map