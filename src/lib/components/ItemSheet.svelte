<script lang="ts">
	import { untrack } from 'svelte';
	import { app } from '$lib/app.svelte';
	import { sortedSections, sortedStores, storeIdsFor } from '$lib/grouping';
	import Sheet from './Sheet.svelte';
	import Icon from './Icon.svelte';

	let { open = $bindable(false), itemId = null, productId }: { open: boolean; itemId?: string | null; productId: string | null } = $props();

	const item = $derived(itemId ? app.snap.items.find((i) => i.id === itemId) : undefined);
	const product = $derived(productId ? app.product(productId) : undefined);
	const stores = $derived(sortedStores(app.snap));
	const linked = $derived(product ? storeIdsFor(app.snap, product.id) : []);
	const UNITS = ['', 'st', 'g', 'kg', 'ml', 'cl', 'l', 'pak', 'fles', 'blik', 'doos', 'zak', 'pot', 'bak', 'rol', 'bos'];

	let name = $state('');
	let note = $state('');
	// alleen bij openen invullen, niet bij elke sync (anders overschrijven we wat je typt)
	$effect(() => {
		if (!open) return;
		void productId;
		void itemId;
		untrack(() => {
			name = product?.name ?? '';
			note = item?.note ?? '';
		});
	});

	function toggleStore(id: string) {
		if (!product) return;
		const next = linked.includes(id) ? linked.filter((s) => s !== id) : [...linked, id];
		app.setProductStores(product.id, next);
	}

	function saveName() {
		if (product && name.trim() && name.trim() !== product.name) app.updateProduct(product.id, { name: name.trim() });
	}
	function saveNote() {
		if (item && (item.note ?? '') !== note.trim()) app.updateItem(item.id, { note: note.trim() || null });
	}
	function step(d: number) {
		if (!item) return;
		const next = Math.max(1, (item.quantity ?? 1) + d);
		app.updateItem(item.id, { quantity: next === 1 && !item.unit ? null : next });
	}
	function sectionFor(storeId: string) {
		return app.snap.productStores.find((ps) => ps.product_id === product?.id && ps.store_id === storeId)?.section_id ?? '';
	}
</script>

<Sheet bind:open title={product?.name ?? ''}>
	{#if product}
		<div class="stack">
			<label class="field">
				<span class="small muted">Naam</span>
				<input class="input" bind:value={name} onblur={saveName} />
			</label>

			{#if item && !item.checked_at}
				<div class="field">
					<span class="small muted">Aantal</span>
					<div class="qty">
						<button class="btn secondary" onclick={() => step(-1)} aria-label="Minder">−</button>
						<input
							class="input num"
							inputmode="decimal"
							value={item.quantity ?? ''}
							placeholder="1"
							onchange={(e) => {
								const v = Number((e.currentTarget as HTMLInputElement).value.replace(',', '.'));
								app.updateItem(item.id, { quantity: Number.isFinite(v) && v > 0 ? v : null });
							}}
						/>
						<button class="btn secondary" onclick={() => step(1)} aria-label="Meer">+</button>
						<select class="input unit" value={item.unit ?? ''} onchange={(e) => app.updateItem(item.id, { unit: (e.currentTarget as HTMLSelectElement).value || null })}>
							{#each UNITS as u (u)}<option value={u}>{u || 'eenheid'}</option>{/each}
						</select>
					</div>
				</div>

				<label class="field">
					<span class="small muted">Notitie</span>
					<input class="input" bind:value={note} onblur={saveNote} placeholder="Bv. lactosevrij, het blauwe pak" />
				</label>
			{/if}

			<div class="field">
				<span class="small muted">Waar kopen we dit? Dit wordt onthouden. Meerdere kan.</span>
				{#if stores.length === 0}
					<p class="small">Je hebt nog geen winkels. <a href="/winkels">Maak er een aan.</a></p>
				{:else}
					<div class="chips">
						{#each stores as s (s.id)}
							<button class="chip" class:active={linked.includes(s.id)} onclick={() => toggleStore(s.id)}>
								<span class="dot" style:background={s.color}></span>{s.name}
							</button>
						{/each}
					</div>
				{/if}
			</div>

			{#each stores.filter((s) => linked.includes(s.id)) as s (s.id)}
				{@const sections = sortedSections(app.snap, s.id)}
				{#if sections.length > 0}
					<label class="field">
						<span class="small muted">Afdeling in {s.name}</span>
						<select
							class="input"
							value={sectionFor(s.id)}
							onchange={(e) => app.setProductSection(product.id, s.id, (e.currentTarget as HTMLSelectElement).value || null)}
						>
							<option value="">Geen afdeling</option>
							{#each sections as sec (sec.id)}<option value={sec.id}>{sec.name}</option>{/each}
						</select>
					</label>
				{/if}
			{/each}

			<button class="btn secondary block" onclick={() => app.updateProduct(product.id, { favorite: !product.favorite })}>
				<Icon name="star" size={18} />
				{product.favorite ? 'Geen favoriet meer' : 'Favoriet'}
			</button>

			{#if item}
				<p class="small muted">
					Toegevoegd {item.source === 'keep' ? 'via Google Home' : item.source === 'siri' ? 'via Siri' : ''}
					{app.profileName(item.added_by) ? `door ${app.profileName(item.added_by)}` : ''}
					om {new Date(item.created_at).toLocaleString('nl-BE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
				</p>
				<button
					class="btn danger block"
					onclick={() => {
						app.deleteItem(item.id);
						open = false;
					}}><Icon name="trash" size={18} /> Van de lijst halen</button
				>
			{/if}
		</div>
	{/if}
</Sheet>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.qty {
		display: flex;
		gap: 8px;
	}
	.qty .btn {
		width: 48px;
		padding: 0;
		font-size: 22px;
	}
	.num {
		width: 72px;
		text-align: center;
	}
	.unit {
		flex: 1;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
</style>
