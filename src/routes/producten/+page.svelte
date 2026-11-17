<script lang="ts">
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte';
	import { sortedStores } from '$lib/grouping';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let q = $state('');
	let storeFilter = $state<string>(page.url.searchParams.get('winkel') ?? 'all');
	let sheetOpen = $state(false);
	let selected = $state<string | null>(null);

	const stores = $derived(sortedStores(app.snap));
	const storeMap = $derived(new Map(stores.map((s) => [s.id, s])));
	const links = $derived.by(() => {
		const m = new Map<string, string[]>();
		for (const ps of app.snap.productStores) m.set(ps.product_id, [...(m.get(ps.product_id) ?? []), ps.store_id]);
		return m;
	});
	const list = $derived(
		app.snap.products
			.filter((p) => !q || p.name_key.includes(q.trim().toLowerCase()))
			.filter((p) =>
				storeFilter === 'all' ? true : storeFilter === 'none' ? !links.get(p.id)?.length : links.get(p.id)?.includes(storeFilter)
			)
			.sort((a, b) => a.name.localeCompare(b.name, 'nl'))
	);
	const openItemId = $derived(selected ? app.snap.items.find((i) => i.product_id === selected && !i.checked_at)?.id : undefined);

	function remove(id: string, name: string) {
		if (confirm(`${name} helemaal vergeten? Het verdwijnt uit suggesties, favorieten en de lijst.`)) app.deleteProduct(id);
	}
</script>

<main class="page">
	<a class="btn ghost back" href="/winkels"><Icon name="back" size={18} /> Winkels</a>
	<h1>Producten</h1>
	<p class="muted small">Alles wat jullie ooit op de lijst zetten, en bij welke winkel het hoort. Tik om aan te passen.</p>

	<input class="input search" type="search" placeholder="Zoeken" bind:value={q} />
	<div class="filters">
		<button class="chip" class:active={storeFilter === 'all'} onclick={() => (storeFilter = 'all')}>Alles</button>
		<button class="chip" class:active={storeFilter === 'none'} onclick={() => (storeFilter = 'none')}>Zonder winkel</button>
		{#each stores as s (s.id)}
			<button class="chip" class:active={storeFilter === s.id} onclick={() => (storeFilter = s.id)}>
				<span class="dot" style:background={s.color}></span>{s.name}
			</button>
		{/each}
	</div>

	{#if list.length === 0}
		<div class="empty">Geen producten gevonden.</div>
	{:else}
		<div class="card row-list">
			{#each list as p (p.id)}
				<div class="list-row">
					<button class="icon-btn star" class:on={p.favorite} onclick={() => app.updateProduct(p.id, { favorite: !p.favorite })} aria-label="Favoriet">
						<Icon name="star" size={20} />
					</button>
					<button
						class="name"
						onclick={() => {
							selected = p.id;
							sheetOpen = true;
						}}
					>
						<span>{p.name}</span>
						<span class="stores small muted">
							{#each links.get(p.id) ?? [] as sid (sid)}
								{@const s = storeMap.get(sid)}
								{#if s}<span><span class="dot" style:background={s.color}></span>{s.name}</span>{/if}
							{:else}
								Algemeen
							{/each}
							· {p.use_count}× gekocht
						</span>
					</button>
					<button class="icon-btn" onclick={() => remove(p.id, p.name)} aria-label="Vergeten"><Icon name="trash" size={18} /></button>
				</div>
			{/each}
		</div>
	{/if}
</main>

<ItemSheet bind:open={sheetOpen} itemId={openItemId} productId={selected} />

<style>
	.back {
		margin-left: -8px;
	}
	.search {
		margin-top: 12px;
	}
	.filters {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		margin: 12px -16px;
		padding: 2px 16px;
		scrollbar-width: none;
	}
	.name {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		border: 0;
		background: none;
		text-align: left;
		padding: 2px 0;
		min-width: 0;
	}
	.stores {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: center;
	}
	.stores > span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.star.on {
		color: #d69e2e;
	}
</style>
