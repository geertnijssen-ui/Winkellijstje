<script lang="ts">
	import { app } from '$lib/app.svelte';
	import { formatQuantity, parseItem } from '$lib/parse';
	import { suggest } from '$lib/grouping';
	import Icon from '$lib/components/Icon.svelte';

	let newSet = $state('');
	let expanded = $state<string | null>(null);
	let addText = $state('');

	const sets = $derived([...app.snap.stapleSets].sort((a, b) => a.position - b.position));
	const favorites = $derived(app.snap.products.filter((p) => p.favorite).sort((a, b) => a.name.localeCompare(b.name, 'nl')));
	const onList = $derived(new Set(app.snap.items.filter((i) => !i.checked_at).map((i) => i.product_id)));
	const addSuggestions = $derived(suggest(app.snap, parseItem(addText).name, 4));

	function createSet(e: SubmitEvent) {
		e.preventDefault();
		if (!newSet.trim()) return;
		const s = app.addStapleSet(newSet);
		expanded = s.id;
		newSet = '';
	}

	function addToSet(setId: string, text = addText) {
		const p = parseItem(text);
		if (!p.name) return;
		app.addToStapleSet(setId, p.name, p.quantity, p.unit);
		addText = '';
	}
</script>

<main class="page">
	<h1>Favorieten</h1>
	<p class="muted small">Met één tik jullie vaste boodschappen op de lijst.</p>

	<h2>Vaste sets</h2>
	{#each sets as set, i (set.id)}
		{@const rows = app.snap.stapleSetItems.filter((r) => r.set_id === set.id)}
		<div class="card set">
			<div class="list-row">
				<button class="name" onclick={() => (expanded = expanded === set.id ? null : set.id)}>
					<strong>{set.name}</strong>
					<span class="small muted">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
				</button>
				<button class="btn" onclick={() => app.addWholeSet(set.id)} disabled={rows.length === 0}>
					<Icon name="plus" size={18} /> Op de lijst
				</button>
			</div>
			{#if expanded === set.id}
				<div class="detail stack">
					<input class="input" value={set.name} onchange={(e) => app.renameStapleSet(set.id, (e.currentTarget as HTMLInputElement).value.trim() || set.name)} />
					{#if rows.length > 0}
						<div class="row-list">
							{#each rows as r (r.product_id)}
								{@const p = app.product(r.product_id)}
								<div class="item">
									<span>{#if r.quantity || r.unit}<strong>{formatQuantity(r.quantity, r.unit)}</strong>{/if} {p?.name}</span>
									<button class="icon-btn" onclick={() => app.removeFromStapleSet(set.id, r.product_id)} aria-label="Uit set"><Icon name="close" size={18} /></button>
								</div>
							{/each}
						</div>
					{/if}
					<form
						class="inline"
						onsubmit={(e) => {
							e.preventDefault();
							addToSet(set.id);
						}}
					>
						<input class="input" placeholder="Bv. 2 melk" bind:value={addText} autocomplete="off" />
						<button class="btn secondary" disabled={!addText.trim()}>Voeg toe</button>
					</form>
					{#if addSuggestions.length > 0 && addText}
						<div class="chips">
							{#each addSuggestions as s (s.id)}
								<button class="chip" onclick={() => addToSet(set.id, s.name)}>{s.name}</button>
							{/each}
						</div>
					{/if}
					<div class="actions">
						<button class="icon-btn" disabled={i === 0} onclick={() => app.reorder('staple_sets', sets, i, -1)} aria-label="Omhoog"><Icon name="up" /></button>
						<button class="icon-btn" disabled={i === sets.length - 1} onclick={() => app.reorder('staple_sets', sets, i, 1)} aria-label="Omlaag"><Icon name="down" /></button>
						<span style="flex:1"></span>
						<button class="btn danger" onclick={() => confirm(`Set "${set.name}" verwijderen?`) && app.deleteStapleSet(set.id)}>Set verwijderen</button>
					</div>
				</div>
			{/if}
		</div>
	{/each}

	<form class="card new" onsubmit={createSet}>
		<input class="input" placeholder="Nieuwe set, bv. Weekboodschappen" bind:value={newSet} />
		<button class="btn secondary" disabled={!newSet.trim()}>Maak</button>
	</form>

	<h2>Favoriete producten</h2>
	{#if favorites.length === 0}
		<p class="small muted">Markeer een product als favoriet (tik op een item op de lijst, dan ★) en het staat hier klaar.</p>
	{:else}
		<div class="fav-grid">
			{#each favorites as p (p.id)}
				<button class="chip fav" class:active={onList.has(p.id)} onclick={() => (onList.has(p.id) ? app.showToast(`${p.name} staat al op de lijst`) : app.addItem(p.name, null, null, null, 'favorites'))}>
					{#if onList.has(p.id)}<Icon name="check" size={16} />{:else}<Icon name="plus" size={16} />{/if}
					{p.name}
				</button>
			{/each}
		</div>
	{/if}
</main>

<style>
	.set {
		margin-bottom: 12px;
	}
	.name {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		border: 0;
		background: none;
		text-align: left;
	}
	.detail {
		padding: 0 14px 14px;
	}
	.item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 44px;
	}
	.inline,
	.new {
		display: flex;
		gap: 8px;
	}
	.new {
		padding: 10px;
	}
	.chips,
	.fav-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.fav {
		min-height: 40px;
	}
	.actions {
		display: flex;
		align-items: center;
	}
	.icon-btn:disabled {
		opacity: 0.25;
	}
</style>
