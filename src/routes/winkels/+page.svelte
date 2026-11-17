<script lang="ts">
	import { app } from '$lib/app.svelte';
	import { sortedSections, sortedStores } from '$lib/grouping';
	import { STORE_COLORS } from '$lib/colors';
	import Icon from '$lib/components/Icon.svelte';

	let newName = $state('');
	let newColor = $state(STORE_COLORS[0]);
	let expanded = $state<string | null>(null);
	let newSection = $state('');

	const stores = $derived(sortedStores(app.snap));
	const counts = $derived.by(() => {
		const m = new Map<string, number>();
		for (const ps of app.snap.productStores) m.set(ps.store_id, (m.get(ps.store_id) ?? 0) + 1);
		return m;
	});

	function add(e: SubmitEvent) {
		e.preventDefault();
		if (!newName.trim()) return;
		if (stores.some((s) => s.name.toLowerCase() === newName.trim().toLowerCase())) {
			app.showToast('Die winkel bestaat al');
			return;
		}
		app.addStore(newName, newColor);
		newName = '';
		newColor = STORE_COLORS[(stores.length + 1) % STORE_COLORS.length];
	}

	function addSection(storeId: string) {
		const names = newSection.split(',').map((s) => s.trim()).filter(Boolean);
		for (const n of names) app.addSection(storeId, n);
		newSection = '';
	}

	function remove(id: string, name: string) {
		if (confirm(`${name} verwijderen? Producten van deze winkel komen terug in Algemeen.`)) app.deleteStore(id);
	}
</script>

<main class="page">
	<h1>Winkels</h1>
	<p class="muted small">Jouw winkels, in de volgorde waarin ze op de lijst staan.</p>

	<form class="card add" onsubmit={add}>
		<input class="input" placeholder="Nieuwe winkel, bv. Colruyt" bind:value={newName} />
		<div class="colors">
			{#each STORE_COLORS as c (c)}
				<button type="button" class="swatch" class:active={newColor === c} style:background={c} onclick={() => (newColor = c)} aria-label="Kleur {c}"></button>
			{/each}
		</div>
		<button class="btn block" disabled={!newName.trim()}>Winkel toevoegen</button>
	</form>

	{#if stores.length > 0}
		<h2>Jullie winkels</h2>
		<div class="card row-list">
			{#each stores as store, i (store.id)}
				<div>
					<div class="list-row">
						<span class="dot" style:background={store.color}></span>
						<button class="name" onclick={() => (expanded = expanded === store.id ? null : store.id)}>
							<strong>{store.name}</strong>
							<span class="small muted">{counts.get(store.id) ?? 0} producten · {sortedSections(app.snap, store.id).length} afdelingen</span>
						</button>
						<button class="icon-btn" disabled={i === 0} onclick={() => app.reorder('stores', stores, i, -1)} aria-label="Omhoog"><Icon name="up" /></button>
						<button class="icon-btn" disabled={i === stores.length - 1} onclick={() => app.reorder('stores', stores, i, 1)} aria-label="Omlaag"><Icon name="down" /></button>
					</div>

					{#if expanded === store.id}
						{@const sections = sortedSections(app.snap, store.id)}
						<div class="detail stack">
							<input class="input" value={store.name} onchange={(e) => app.updateStore(store.id, { name: (e.currentTarget as HTMLInputElement).value.trim() || store.name })} />
							<div class="colors">
								{#each STORE_COLORS as c (c)}
									<button type="button" class="swatch" class:active={store.color === c} style:background={c} onclick={() => app.updateStore(store.id, { color: c })} aria-label="Kleur {c}"></button>
								{/each}
							</div>

							<div>
								<strong class="small">Afdelingen (in looprichting)</strong>
								<p class="small muted">Zo staan de items in de winkelmodus in de volgorde waarin je door de winkel loopt.</p>
								{#if sections.length > 0}
									<div class="sections row-list">
										{#each sections as sec, j (sec.id)}
											<div class="sec">
												<input class="input" value={sec.name} onchange={(e) => app.renameSection(sec.id, (e.currentTarget as HTMLInputElement).value.trim() || sec.name)} />
												<button class="icon-btn" disabled={j === 0} onclick={() => app.reorder('sections', sections, j, -1)} aria-label="Omhoog"><Icon name="up" /></button>
												<button class="icon-btn" disabled={j === sections.length - 1} onclick={() => app.reorder('sections', sections, j, 1)} aria-label="Omlaag"><Icon name="down" /></button>
												<button class="icon-btn" onclick={() => app.deleteSection(sec.id)} aria-label="Verwijderen"><Icon name="trash" size={18} /></button>
											</div>
										{/each}
									</div>
								{/if}
								<form
									class="sec-add"
									onsubmit={(e) => {
										e.preventDefault();
										addSection(store.id);
									}}
								>
									<input class="input" placeholder="Bv. Groenten, Zuivel, Diepvries" bind:value={newSection} />
									<button class="btn secondary" disabled={!newSection.trim()}>Voeg toe</button>
								</form>
								<p class="small muted">Tip: meerdere tegelijk met komma's. Ideeën: groenten & fruit, brood, vlees, zuivel, kaas, diepvries, drank, droge voeding, verzorging, huishouden.</p>
							</div>

							<div class="actions">
								<a class="btn secondary" href="/producten?winkel={store.id}">Producten bekijken</a>
								<button class="btn danger" onclick={() => remove(store.id, store.name)}><Icon name="trash" size={18} /> Verwijderen</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty">Nog geen winkels. Voeg hierboven je eerste winkel toe.</div>
	{/if}

	<p class="small center"><a href="/producten">Alle producten en hun winkel beheren →</a></p>
</main>

<style>
	.add {
		margin-top: 16px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.colors {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.swatch {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 3px solid transparent;
		outline: 2px solid transparent;
	}
	.swatch.active {
		border-color: var(--surface);
		outline-color: var(--text);
	}
	.name {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		border: 0;
		background: none;
		padding: 4px 0;
		text-align: left;
	}
	.icon-btn:disabled {
		opacity: 0.25;
	}
	.detail {
		padding: 4px 14px 16px;
	}
	.detail p {
		margin: 2px 0 8px;
	}
	.sections {
		margin-bottom: 8px;
	}
	.sec {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 0;
	}
	.sec-add {
		display: flex;
		gap: 8px;
	}
	.actions {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 8px;
	}
	.center {
		text-align: center;
		margin-top: 24px;
	}
</style>
