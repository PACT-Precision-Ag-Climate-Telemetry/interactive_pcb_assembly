import './style.css'
import { h } from './lib/dom'
import { labelSheetCard } from './views/label-sheet'
import { labelPayload } from './lib/labels'
import { qrDataUrl } from './lib/barcode'

const item = { id: '1', code: 'PACT_STK_0003', name: 'Male pin header 2.54 mm 1x40', supplier: 'Shopee: ABC Electronics', order_no: '2411250001234', qty: 50, bom_line_ids: [], notes: null, created_at: '' }
const item2 = { ...item, id: '2', code: 'PACT_STK_0004', name: 'Female header 2.54 mm 1x20', supplier: 'Lazada: PinShop', order_no: '2411300009876' }
const sheet = labelSheetCard()
const app = document.getElementById('app')!
const prev = h('img', { style: 'width:110px;height:110px;image-rendering:pixelated;border:1px solid #ccc' })
void qrDataUrl(labelPayload(item.code, item.supplier, item.order_no)).then((s) => (prev.src = s))
app.append(
  h('div', { class: 'card' }, h('h2', null, 'Demo: Stock page (fake data, nothing is saved)'),
    h('p', { class: 'small muted' }, 'Step 1: on the Stock page, find the item in the table and press "Print label".'),
    h('table', { class: 'table' }, h('thead', null, h('tr', null, ['Code', 'Name', 'Seller', 'Order no.', ''].map((t) => h('th', null, t)))),
      h('tbody', null, h('tr', null, h('td', { class: 'mono' }, item.code), h('td', null, item.name), h('td', null, item.supplier), h('td', null, item.order_no),
        h('td', null, h('button', { class: 'btn small', onclick: () => sheet.show(item) }, 'Add to label sheet'))),
        h('tr', null, h('td', { class: 'mono' }, item2.code), h('td', null, item2.name), h('td', null, item2.supplier), h('td', null, item2.order_no),
        h('td', null, h('button', { class: 'btn small', onclick: () => sheet.show(item2) }, 'Add to label sheet'))))),
    h('p', { class: 'small' }, 'QR content: ', h('code', null, labelPayload(item.code, item.supplier, item.order_no))), prev),
  sheet.el)
