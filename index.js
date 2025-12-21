defaults = {
    node: {
        stroke_color: "#000",
        width: 128,
        max_width: 512,
        height: 32,
        spacing: 30
    },
}

SVG_NS = "http://www.w3.org/2000/svg"
HTML_NS = "http://www.w3.org/1999/xhtml"
SAVES_STORAGE_KEY = "saves"
ASSUMED_CHAR_WIDTH = 10
ASSUMED_CHAR_HEIGHT = 24
NAVBAR_HEIGHT = 64
CORNER_RADIUS = 10
STROKE_WIDTH = 2

/* type Node = {
 *     id: int
 *     pr: Node?
 *     co: str
 *     bc: str?
 *     tc: str?
 *     ch: Node[]
 *     element: HTMLElement?
 * }
 */

function _getId() {
    let i = 1
    return () => i++
}

getId = _getId()

function nodeCreateDefault(parent /*Node*/) {
    return { id: getId(), pr: parent, co: "", ch: [] }
}

function nodeIsRoot(node /*Node*/) /*bool*/ {
    return node.pr == null
}

function nodeRemove(node /*Node*/) {
    const parent_node = node.pr
    const child_idx = parent_node.ch.findIndex(it => it === node)
    parent_node.ch.splice(child_idx, 1, ...node.ch)
}

function nodeAddChild(node /*Node*/) /*Node*/ {
    const new_node = nodeCreateDefault(node)
    node.ch.push(new_node)
    return new_node
}

function nodeAddParent(node /*Node*/) /*Node*/ {
    const parent_node = node.pr

    const new_node = nodeCreateDefault(parent_node)
    node.pr = new_node

    new_node.ch = [node]
    const node_idx = parent_node.ch.findIndex(it => it === node)
    parent_node.ch.splice(node_idx, 1, new_node)

    return new_node
}

app_state = {
    selected_node_id: 0,
    root_node: nodeCreateDefault(null),
    root_x: 0,
    root_y: 0,
    scale: 1,
    saves: [],
    load_selected: null,
    need_rerender: true,
    view_box: {
        min_x: -1000,
        min_y: -500,
        width: 2000,
        height: 1000,
    },
}

function viewBoxString() {
    const vb = app_state.view_box
    return `${vb.min_x} ${vb.min_y} ${vb.width} ${vb.height}`
}

function main() {
    const svg = document.createElementNS(SVG_NS, "svg");
    document.getElementById("main").appendChild(svg)

    app_state.selected_node_id = app_state.root_node.id
    app_state.root_node.co = "Root node"

    app_state.view_box.width = window.innerWidth
    app_state.view_box.height = window.innerHeight - NAVBAR_HEIGHT
    app_state.view_box.min_x = - app_state.view_box.width / 2
    app_state.view_box.min_y = - app_state.view_box.height / 2

    setupUI()

    function renderLoop() {
        if (app_state.need_rerender) {
            svg.setAttribute("viewBox", viewBoxString())
            svg.setAttribute(
                "style",
                `min-width: ${app_state.view_box.width}; min-height: ${app_state.view_box.height};`,
            )

            app_state.need_rerender = false
            svg.replaceChildren(render())
        }
        window.requestAnimationFrame(renderLoop)
    }
    renderLoop()
}

function render(node /*WrappedNode*/, x /*int*/, y /*int*/) {
    return renderNode(app_state.root_node, app_state.root_x, app_state.root_y)
}

function setPos(
    elem /*SVG elem*/, x /*int*/, y /*int*/, w /*int*/, h /*int*/
) /*void*/ {
    elem.setAttribute("x", x)
    elem.setAttribute("y", y)
    elem.setAttribute("width", w)
    elem.setAttribute("height", h)
}

function cssVar(s /*string*/) /*string*/ {
    return `var(--${s})`
}

function renderNode(
    node /*Node*/, x /*int*/, y /*int*/
) /*SVG HTML element*/ {
    const lines = node.co.split("\n")
    const node_width = Math.max(
        lines.reduce((a, c) =>  Math.max(a, c.length), 0) * ASSUMED_CHAR_WIDTH,
        defaults.node.width
    )
    const node_height = Math.max(
        lines.length * ASSUMED_CHAR_HEIGHT, defaults.node.height
    )
    const node_x = x - node_width / 2
    const node_y = y - node_height / 2

    const fill_color = nodeIsRoot(node) ? "fill-root-color" : "fill-color"
    const stroke_color = node.id == app_state.selected_node_id
        ? "stroke-selected-color"
        : "stroke-color"

    let node_svg = createSVGRect(
        node_x, node_y,
        node_width, node_height,
        CORNER_RADIUS,
        cssVar(fill_color), cssVar(stroke_color)
    )

    const content_div = document.createElementNS(HTML_NS, "div")
    content_div.classList.add("node-text")
    content_div.innerText = node.co
    content_div.contentEditable = "true"

    const outer_div = document.createElementNS(HTML_NS, "div")
    outer_div.classList.add("node-text-wrapper")
    outer_div.appendChild(content_div)

    foreign_obj = document.createElementNS(SVG_NS, "foreignObject")
    foreign_obj.appendChild(outer_div)
    setPos(foreign_obj, node_x, node_y, node_width, node_height)

    let shouldFireChange = false;
    content_div.addEventListener("input", () => {
        shouldFireChange = true;
    });
    content_div.addEventListener("focusout", () => {
        if(!shouldFireChange) {
            return
        }
        shouldFireChange = false;
        if (content_div.innerText) {
            node.co = content_div.innerText
        } else if (nodeIsRoot(node)) {
            node.co = "Root Node"
        } else {
            nodeRemove(node)
        }
        app_state.need_rerender = true
    });

    let group = document.createElementNS(SVG_NS, "g")
    group.appendChild(node_svg)
    group.appendChild(foreign_obj)

    return group
}

function createSVGRect(x, y, w, h, r, fill, stroke) /*SVG HTML Element*/ {
    let rect = document.createElementNS(SVG_NS, "rect")
    setPos(rect, x, y, w, h)
    rect.setAttribute("rx", r)
    rect.setAttribute("ry", r)
    rect.setAttribute("stroke", stroke)
    rect.setAttribute("fill", fill)
    rect.setAttribute("stroke-width", STROKE_WIDTH)
    return rect
}

/* type SerializedNode = {
 *     id: int
 *     pr: int
 *     co: str
 *     bc: str?
 *     tc: str?
 *     ch: int[]
 * }
 */

function serializeNode(node /*Node*/) /*SerializedNode*/ {
    return { id: node.id, pr: node.pr?.id ?? null , co: node.co,
        bc: node.bc, tc: node.tc, ch: node.ch }
}

function toJson(node /*Node*/) /*string*/ {
    let nodes = [serializeNode(node)]

    for (let i = 0; i < nodes.length; i++) {
        let current_node = nodes[i]
        nodes.push(...current_node.ch.map(serializeNode))
        current_node.ch = current_node.ch.map(it => it.id)
    }
    console.debug(nodes)
    return JSON.stringify(nodes)
}

function fromJson(json_ /*string*/) /*Node*/ {
    try {
        let root_node = null
        const parsed = JSON.parse(json_)
        const childs = {}
        for (let node of parsed) {
            if (nodeIsRoot(node)) {
                root_node = node
            }
            if (node.pr in childs) {
                childs[node.pr].push(node)
            } else {
                childs[node.pr] = [node]
            }
        }
        console.debug(childs)
        for (let node of parsed) {
            if (node.id in childs) {
                node.child = childs[node.id]
                for (let child of node.child) {
                    child.pr = node
                }
            } else {
                node.child = []
            }
        }
        return root_node
    } catch {
        return null
    }
}

function save() {
    const save_name = document.getElementById("save_name").value
    app_state.saves = [save_name].concat(app_state.saves)
    const load_selector = document.getElementById("load_name")
    load_selector[load_selector.options.length] = new Option(save_name, save_name, true, true)

    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(app_state.saves))
    localStorage.setItem(save_name, toJson(app_state.root_node))
}

function load() {
    const load_selected = document.getElementById("load_name").value
    const loaded_root = fromJson(localStorage.getItem(load_selected))
    app_state.root_node = loaded_root
    app_state.selected_node_id = app_state.root_node.id
    app_state.need_rerender = true
}

function setupUI() {
    document.getElementById("save_name").value = new Date().toLocaleString()
    let load_name = document.getElementById("load_name")
    app_state.saves = JSON.parse(localStorage.getItem(SAVES_STORAGE_KEY)) ?? []
    if (app_state.saves) {
        for (let save of app_state.saves) {
            load_name[load_name.options.length] = new Option(save, save, false, false)
        }
    }
    app_state.load_selected = load_name.value
}

main()
