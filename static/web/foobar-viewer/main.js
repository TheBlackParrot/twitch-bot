const delay = ms => new Promise(res => setTimeout(res, ms));

function sortFunction(a, b) {
	a = a.toLowerCase().replace(/[^a-z0-9]/gi, '');
	b = b.toLowerCase().replace(/[^a-z0-9]/gi, '');

	if (a > b) {
		return 1;
	} else if (b > a) {
		return -1;
	} else {
		return 0;
	}
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const now = new Date();

async function fetchLibrary() {
	const response = await fetch("./foobarLibrary.json");
	const libraryData = await response.json();

	let data = [];
	for(const code in libraryData) {
		data.push(libraryData[code]);
	}

	const grid = new gridjs.Grid({
		columns: [
			{
				id: "requestCode",
				name: "CodeActual",
				hidden: true,
				sort: false
			},
			{
				name: "Code",
				sort: false,
				formatter: (cell, row) => {
					return gridjs.h('button', {
						className: "codeButton",
						onClick: async () => {
							await navigator.clipboard.writeText(`!fb2kr ${row.cells[0].data}`);
						}
					}, row.cells[0].data)
				},
				attributes: (cell, row) => {
					if(row) {
						return {
							'data-id': row._id
						};
					}
				}
			},
			{
				id: "id", // ignore
				name: "",
				formatter: (cell, row) => {
					if(Date.now() - row.cells[row.cells.length - 1].data < 2592000000) {
						return "NEW";
					} else {
						const then = new Date(row.cells[row.cells.length - 1].data);
						const months = ((now.getFullYear() - then.getFullYear()) * 12) + (now.getMonth() - then.getMonth());
						return `${months}mo`;
					}
				},
				sort: false
			},
			{
				id: "title",
				name: "Title",
				sort: {
					compare: sortFunction
				}
			},
			{
				id: "artist",
				name: "Artist",
				sort: {
					compare: sortFunction
				}
			},
			{
				id: "album",
				name: "Album",
				sort: {
					compare: sortFunction
				}
			},
			{
				id: "created",
				name: "Date Added",
				formatter: (cell, row) => {
					const then = new Date(cell);
					const output = [
						then.getDate(),
						monthNames[then.getMonth()],
						then.getFullYear()
					];

					const elements = $(`.cell[data-id="${row._id}"]`);
					if(elements.length) {
						const parent = $(elements[0].closest(".row"));

						// 2592000 seconds is 30 days
						if(Date.now() - cell < 2592000000) {
							if(elements.length) {
								parent.addClass("new");
							}
						} else {
							// 2592000 seconds is 30 days, 63113904 seconds is 2 years
							const multiplier = 1 - Math.min(Math.max((now.getTime() - then.getTime() + 2592000000) / 63113904000, 0), 1);
							
							const alpha = Math.min(Math.max(Math.round(255 * multiplier), 32), 255).toString(16).padStart(2, "0");
							const fontSize = Math.min(Math.max(7 + (3 * multiplier), 7), 10);

							parent.children(`.cell[data-column-id="id"]`).css("color", `#ffffff${alpha}`).css("font-size", `${fontSize}pt`);
						}
					}

					return output.join(" ");
				}
			}
		],
		data: data,
		sort: true,
		search: true,
		pagination: {
			limit: 200,
			summary: true
		},
		fixedHeader: true,
		height: 'calc(100vh - 144px)',
		autoWidth: true,
		className: {
			td: "cell",
			tr: "row",
			th: "header",
			thead: "headerHeader",
			footer: "footer",
			paginationSummary: "summary",
			paginationButton: "pageButton",
			paginationButtonCurrent: "pageButtonCurrent"
		}
	}).render(document.getElementById("wrapper"));

	grid.on('cellClick', async (...args) => {
		if(args[0].target.textContent === "Copied!") {
			return;
		}

		if(typeof(args[1].data) !== "undefined") {
			return;
		}

		//console.log(args[0].target);
		
		const old = args[0].target.textContent;
		
		args[0].target.attributes[0].value = "codeButton invert";
		args[0].target.textContent = "Copied!";
		await delay(4000);
		args[0].target.attributes[0].value = "codeButton";
		await delay(100);
		args[0].target.textContent = old;
	});
}

fetchLibrary();