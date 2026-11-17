<script lang="ts">
	import { app } from '$lib/app.svelte';
	import type { Row } from '$lib/grouping';
	import { formatQuantity } from '$lib/parse';
	import { sortedStores, storeIdsFor } from '$lib/grouping';
	import Icon from './Icon.svelte';

	let {
		row,
		storeId = null,
		big = false,
		showAssign = false,
		showStores = false,
		onopen
	}: {
		row: Row;
		storeId?: string | null;
		big?: boolean;
		showAssign?: boolean;
		showStores?: boolean;
		onopen: (row: Row) => void;
	} = $props();

	const checked = $derived(Boolean(row.item.checked_at));
	const qty = $derived(formatQuantity(row.item.quantity, row.item.unit));
	const adder = $derived(app.profileName(row.item.added_by));
	const fromMe = $derived(row.item.added_by === app.userId);
	const source = $derived(row.item.source === 'keep' ? 'Google Home' : row.item.source === 'siri' ? 'Siri' : null);
	const stores = $derived(sortedStores(app.snap));
	const myStores = $derived(stores.filter((s) => storeIdsFor(app.snap, row.product.id).includes(s.id)));
</script>

<div class="item" class:big class:checked>
	<button
		class="check"
		aria-label={checked ? 'Niet afgevinkt maken' : 'Afvinken'}
		onclick={() => app.setChecked(row.item.id, !checked, storeId)}
	>
		<span class="box">{#if checked}<Icon name="check" size={big ? 22 : 18} />{/if}</span>
	</button>
	<button class="main" onclick={() => onopen(row)}>
		<span class="name">
			{#if qty}<span class="qty">{qty}</span>{/if}
			{row.product.name}
		</span>
		{#if row.item.note || (!fromMe && adder) || source || (showStores && myStores.length > 1)}
			<span class="meta">
				{#if row.item.note}<span class="note">{row.item.note}</span>{/if}
				{#if source}<span>via {source}</span>{:else if !fromMe && adder}<span>{adder}</span>{/if}
				{#if showStores && myStores.length > 1}
					<span class="multi">ook bij {myStores.filter((s) => s.id !== storeId).map((s) => s.name).join(', ')}</span>
				{/if}
			</span>
		{/if}
	</button>
</div>
{#if showAssign && stores.length > 0 && !checked}
	<div class="assign">
		<span class="small muted">Winkel:</span>
		{#each stores as s (s.id)}
			<button class="chip" onclick={() => app.setProductStores(row.product.id, [s.id])}>
				<span class="dot" style:background={s.color}></span>{s.name}
			</button>
		{/each}
	</div>
{/if}

<style>
	.item {
		display: flex;
		align-items: stretch;
		min-height: 52px;
	}
	.check {
		flex: none;
		width: 52px;
		display: grid;
		place-items: center;
		border: 0;
		background: none;
	}
	.box {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: 2px solid var(--line);
		display: grid;
		place-items: center;
		color: var(--accent-text);
		transition: background 0.15s;
	}
	.checked .box {
		background: var(--accent);
		border-color: var(--accent);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2px;
		padding: 8px 14px 8px 0;
		border: 0;
		background: none;
		text-align: left;
	}
	.name {
		overflow-wrap: anywhere;
	}
	.qty {
		font-weight: 700;
		margin-right: 4px;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 13px;
		color: var(--muted);
	}
	.note {
		color: var(--text);
		opacity: 0.8;
		font-style: italic;
	}
	.multi {
		color: var(--accent);
	}
	.checked .name {
		text-decoration: line-through;
		color: var(--muted);
	}
	.big {
		min-height: 64px;
		font-size: 19px;
	}
	.big .check {
		width: 64px;
	}
	.big .box {
		width: 32px;
		height: 32px;
	}
	.assign {
		display: flex;
		align-items: center;
		gap: 6px;
		overflow-x: auto;
		padding: 0 14px 10px 52px;
		scrollbar-width: none;
		border-top: 0 !important;
	}
	.assign .chip {
		font-size: 13px;
		padding: 4px 10px;
	}
</style>
