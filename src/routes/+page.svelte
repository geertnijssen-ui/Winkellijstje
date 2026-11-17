<script lang="ts">
	import { app } from '$lib/app.svelte';
	import { overview, productIndex, type Row } from '$lib/grouping';
	import AddBar from '$lib/components/AddBar.svelte';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let filter = $state<'all' | string>('all');
	let showChecked = $state(false);
	let sheetOpen = $state(false);
	let selected = $state<{ itemId: string; productId: string } | null>(null);

	const groups = $derived(overview(app.snap));
	const openCount = $derived(app.snap.items.filter((i) => !i.checked_at).length);
	const visible = $derived(
		groups.filter((g) => (filter === 'all' ? g.rows.length > 0 || g.store : (g.store?.id ?? 'general') === filter))
	);
	const recentlyChecked = $derived.by(() => {
		const products = productIndex(app.snap);
		return app.snap.items
			.filter((i) => i.checked_at)
			.sort((a, b) => b.checked_at!.localeCompare(a.checked_at!))
			.slice(0, 30)
			.flatMap((item) => {
				const product = products.get(item.product_id);
				return product ? [{ item, product, sectionId: null } satisfies Row] : [];
			});
	});
	const shoppers = $derived(
		app.snap.profiles.filter(
			(p) =>
				p.id !== app.userId &&
				p.shopping_store_id &&
				p.shopping_since &&
				Date.now() - new Date(p.shopping_since).getTime() < 3 * 3600 * 1000
		)
	);

	function open(row: Row) {
		selected = { itemId: row.item.id, productId: row.product.id };
		sheetOpen = true;
	}
</script>

<main class="page">
	<header class="top">
		<div>
			<h1>Lijst</h1>
			<p class="small muted">
				{openCount === 0 ? 'Niets nodig' : `${openCount} item${openCount === 1 ? '' : 's'}`}{app.snap.household
					? ` · ${app.snap.household.name}`
					: ''}
			</p>
		</div>
	</header>

	{#each shoppers as s (s.id)}
		<p class="shopper small">
			<Icon name="cart" size={16} />
			{s.display_name} is nu bij {app.snap.stores.find((st) => st.id === s.shopping_store_id)?.name ?? 'de winkel'}. Wat je toevoegt, krijgt
			die meteen te zien.
		</p>
	{/each}

	<AddBar />

	<div class="filters">
		<button class="chip" class:active={filter === 'all'} onclick={() => (filter = 'all')}>Alles</button>
		{#each groups as g (g.store?.id ?? 'general')}
			{#if g.store || g.rows.length > 0}
				<button
					class="chip"
					class:active={filter === (g.store?.id ?? 'general')}
					onclick={() => (filter = g.store?.id ?? 'general')}
				>
					{#if g.store}<span class="dot" style:background={g.store.color}></span>{/if}
					{g.store?.name ?? 'Algemeen'}
					<span class="count">{g.rows.length}</span>
				</button>
			{/if}
		{/each}
	</div>

	{#if app.snap.stores.length === 0}
		<div class="card tip">
			<strong>Tip:</strong> maak eerst je winkels aan bij <a href="/winkels">Winkels</a>. Daarna kies je per item één keer de winkel,
			en dat wordt onthouden.
		</div>
	{/if}

	{#each visible as g (g.store?.id ?? 'general')}
		<section>
			<div class="group-head">
				<h2>
					{#if g.store}<span class="dot" style:background={g.store.color}></span>{/if}
					{g.store?.name ?? 'Algemeen'}
					<span class="count">{g.rows.length}</span>
				</h2>
				{#if g.store && g.rows.length > 0}
					<a class="btn ghost small" href="/winkel/{g.store.id}"><Icon name="cart" size={16} /> Winkelen</a>
				{/if}
			</div>
			{#if g.rows.length > 0}
				<div class="card row-list">
					{#each g.rows as row (row.item.id + (g.store?.id ?? ''))}
						<div>
							<ItemRow {row} storeId={g.store?.id ?? null} showAssign={!g.store} showStores onopen={open} />
						</div>
					{/each}
				</div>
				{#if !g.store && app.snap.stores.length > 0}
					<p class="small muted hint">Kies een winkel en dat product komt er voortaan altijd onder.</p>
				{/if}
			{:else}
				<p class="small muted hint">Niets nodig hier.</p>
			{/if}
		</section>
	{/each}

	{#if openCount === 0 && filter === 'all'}
		<div class="empty">
			<p>De lijst is leeg. Tik hierboven om iets toe te voegen, of zeg “Hey Google, zet melk op mijn boodschappenlijst”.</p>
		</div>
	{/if}

	{#if recentlyChecked.length > 0}
		<button class="btn ghost" onclick={() => (showChecked = !showChecked)}>
			{showChecked ? 'Verberg' : 'Toon'} recent afgevinkt ({recentlyChecked.length})
		</button>
		{#if showChecked}
			<div class="card row-list">
				{#each recentlyChecked as row (row.item.id)}
					<div><ItemRow {row} onopen={open} /></div>
				{/each}
			</div>
		{/if}
	{/if}
</main>

<ItemSheet bind:open={sheetOpen} itemId={selected?.itemId} productId={selected?.productId ?? null} />

<style>
	.top {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		margin-bottom: 14px;
	}
	.top p {
		margin: 2px 0 0;
	}
	.filters {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		margin: 14px -16px 0;
		padding: 2px 16px;
		scrollbar-width: none;
	}
	.count {
		font-size: 12px;
		opacity: 0.7;
		font-weight: 500;
	}
	.group-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.group-head h2 {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.group-head .btn {
		min-height: 36px;
		margin-top: 12px;
	}
	.hint {
		margin: 6px 4px 0;
	}
	.tip {
		margin-top: 16px;
		padding: 14px 16px;
		font-size: 15px;
	}
	.shopper {
		display: flex;
		gap: 8px;
		align-items: center;
		margin: 0 0 12px;
		padding: 10px 12px;
		border-radius: 12px;
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>
