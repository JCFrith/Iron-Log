export function meter(label, value) {
  return `<div class="barrow"><div class="barhead"><span>${label}</span><b>${value}%</b></div><div class="bar"><i style="width:${value}%"></i></div></div>`
}

export function insight(icon, title, text = '') {
  return `<article class="insight"><div class="ico">${icon}</div><div><b>${title}</b>${text ? `<p>${text}</p>` : ''}</div></article>`
}

export function metric(title, value, trend) {
  return `<section class="card s3"><h3>${title}</h3><div class="big">${value}</div><small class="positive">${trend}</small><div class="spark">${[4, 6, 5, 8, 7, 10, 9].map((height) => `<i style="height:${height * 3 + 8}px"></i>`).join('')}</div></section>`
}

export function card(title, content, span = 's6') {
  return `<section class="card ${span}"><h3>${title}</h3>${content}</section>`
}

export function table(headers, rows) {
  return `<table class="table"><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
