<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { app } from '$lib/app.svelte';
	import { storeView, type Row } from '$lib/grouping';
	import ItemRow from '$lib/components/ItemRow.svelte';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import AddBar from '$lib/components/AddBar.svelte';

	const storeId = $derived(page.params.id!);
	const store = $derived(app.snap.stores.find((s) => s.id === storeId));
	// afgevinkte items van deze winkelronde (en de laatste 2 uur) blijven onderaan zichtbaar
	const startedAt = Date.now() - 2 * 3600 * 1000;
	const view = $derived(storeView(app.snap, storeId, startedAt));

	let sheetOpen = $state(false);
	let selected = $state<{ itemId: string; productId: string } | null>(null);
	let showUnassigned = $state(false);
	let showAdd = $state(false);
	let wakeLock: { release: () => Promise<void> } | null = null;

	let enteredFor: string | null = null;
	$effect(() => {
		const id = storeId;
		if (app.me && id && enteredFor !== id) {
			enteredFor = id;
			untrack(() => app.enterStore(id));
		}
	});

	// scherm laten aanstaan tijdens het winkelen
	$effect(() => {
		const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
		nav.wakeLock?.request('screen').then((l) => (wakeLock = l)).catch(() => {});
	});

	onDestroy(() => {
		app.leaveStore();
		wakeLock?.release().catch(() => {});
	});

	function open(row: Row) {
		selected = { itemId: row.item.id, productId: row.product.id };
		sheetOpen = true;
	}

	function done() {
		goto('/');
	}
</script>

<main class="page shop">
	<header>
		<button class="icon-btn" onclick={done} aria-label="Terug"><Icon name="back" /></button>
		<div class="title">
			{#if store}<span class="dot big" style:background={store.color}></span>{/if}
			<h1>{store?.name ?? 'Winkel'}</h1>
		</div>
		<button class="icon-btn" onclick={() => (showAdd = !showAdd)} aria-label="Toevoegen"><Icon name="plus" /></button>
	</header>
	<p class="muted small sub">
		{view.openCount === 0 ? 'Alles gevonden!' : `Nog ${view.openCount} te zoeken`}
		{#if view.checked.length > 0}· {view.checked.length} in je kar{/if}
	</p>

	{#if showAdd}
		<div class="add"><AddBar /></div>
	{/if}

	{#each view.groups as g (g.section?.id ?? 'none')}
		<h2>{g.section?.name ?? (view.groups.length > 1 ? 'Overige' : 'Te kopen')}</h2>
		<div class="card row-list">
			{#each g.rows as row (row.item.id)}
				<div><ItemRow {row} {storeId} big showStores onopen={open} /></div>
			{/each}
		</div>
	{/each}

	{#if view.openCount === 0}
		<div class="empty done">
			<div class="party">🎉</div>
			<p>Klaar in {store?.name}!</p>
			<button class="btn" onclick={done}>Terug naar de lijst</button>
		</div>
	{/if}

	{#if view.unassigned.length > 0}
		<button class="btn ghost" onclick={() => (showUnassigned = !showUnassigned)}>
			{showUnassigned ? 'Verberg' : 'Toon'} nog niet toegewezen ({view.unassigned.length})
		</button>
		{#if showUnassigned}
			<div class="card row-list">
				{#each view.unassigned as row (row.item.id)}
					<div class="unassigned">
						<ItemRow {row} {storeId} big onopen={open} />
						<button class="btn ghost small here" onclick={() => app.setProductStores(row.product.id, [storeId])}>
							Hoort bij {store?.name}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}

	{#if view.checked.length > 0}
		<h2>In je kar</h2>
		<div class="card row-list checked">
			{#each view.checked as row (row.item.id)}
				<div><ItemRow {row} {storeId} big onopen={open} /></div>
			{/each}
		</div>
	{/if}
</main>

<ItemSheet bind:open={sheetOpen} itemId={selected?.itemId} productId={selected?.productId ?? null} />

<style>
	.shop {
		padding-bottom: calc(env(safe-area-inset-bottom) + 96px);
	}
	header {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: -8px;
	}
	.title {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.dot.big {
		width: 14px;
		height: 14px;
	}
	.sub {
		margin: 2px 0 0 36px;
	}
	.add {
		margin-top: 12px;
	}
	.checked {
		opacity: 0.75;
	}
	.unassigned .here {
		margin: -8px 0 8px 64px;
		min-height: 32px;
	}
	.done .party {
		font-size: 48px;
	}
</style>
