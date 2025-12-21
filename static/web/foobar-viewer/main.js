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
				}
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