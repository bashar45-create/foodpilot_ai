import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View, type ListRenderItem } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppScreen } from '@/components/AppScreen';
import { Card } from '@/components/Card';
import { listRecipes, getRecipe, type Recipe } from '@/api/endpoints/recipes';
import { AppText } from '@/lib/typography';
import { colors } from '@/lib/colors';
import { useSyncAwareRefetchInterval } from '@/lib/sync/useSyncAwareRefetchInterval';

interface RecipeRowProps {
  recipe: Recipe;
  isOpen: boolean;
  onToggle: () => void;
}

const RecipeRow = memo(function RecipeRow({
  recipe,
  isOpen,
  onToggle,
}: RecipeRowProps): JSX.Element {
  return (
    <Pressable onPress={onToggle}>
      <Card>
        <View style={styles.rowHeader}>
          <AppText variant="heading" style={styles.rowTitle} numberOfLines={1}>
            {recipe.name}
          </AppText>
          <AppText variant="caption">{recipe.ingredients.length} ingredients</AppText>
        </View>
        {recipe.description ? (
          <AppText variant="body" faint>{recipe.description}</AppText>
        ) : null}
        {isOpen ? <RecipeDetail recipe={recipe} /> : null}
      </Card>
    </Pressable>
  );
});

interface RecipeDetailProps {
  recipe: Recipe;
}

function RecipeDetailImpl({ recipe }: RecipeDetailProps): JSX.Element {
  const refetchInterval = useSyncAwareRefetchInterval();
  const detailQuery = useQuery({
    queryKey: ['recipe', recipe.id],
    queryFn: () => getRecipe(recipe.id),
    enabled: Boolean(recipe.id),
    staleTime: 5 * 60_000,
    refetchInterval,
  });
  const full: Recipe = detailQuery.data ?? recipe;
  const steps = useMemo(
    () => (full.preparationSteps ?? []).filter((s) => s.trim().length > 0),
    [full.preparationSteps],
  );

  return (
    <View style={styles.detailWrap}>
      {full.servingSize ? (
        <AppText variant="caption">Serving size: {full.servingSize}</AppText>
      ) : null}
      <View>
        <AppText variant="overline">Ingredients</AppText>
        {full.ingredients.length === 0 ? (
          <AppText variant="body" faint>No ingredients listed.</AppText>
        ) : (
          <View style={styles.list}>
            {full.ingredients.map((ing, idx) => (
              <AppText key={`${ing.ingredientId}-${idx}`} variant="body">
                • {Number(ing.quantity).toFixed(2)}
                {ing.unit ? ` ${ing.unit}` : ''} — {ing.ingredientName ?? ing.ingredientId}
              </AppText>
            ))}
          </View>
        )}
      </View>
      {steps.length > 0 ? (
        <View>
          <AppText variant="overline">Preparation</AppText>
          <View style={styles.list}>
            {steps.map((step, idx) => (
              <AppText key={idx} variant="body">
                {idx + 1}. {step}
              </AppText>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const RecipeDetail = memo(RecipeDetailImpl);

function RecipesScreenImpl(): JSX.Element {
  const refetchInterval = useSyncAwareRefetchInterval();
  const recipesQuery = useQuery({
    queryKey: ['recipes', 'all'],
    queryFn: listRecipes,
    // Re-fetch on every mount instead of trusting the AsyncStorage-cached
    // response. The cachePersister replays the entire previous session's
    // cache, and if the previous session captured an empty array (e.g. the
    // worker had no recipes cached yet, or hit a 401 that was treated as
    // empty) the empty value gets locked in for the full staleTime window.
    // staleTime: 0 + refetchOnMount: 'always' guarantees a fresh fetch when
    // the worker opens the Recipes tab.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval,
  });
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = recipesQuery.data ?? [];
    return q.length === 0 ? list : list.filter((r) => (r.name ?? '').toLowerCase().includes(q));
  }, [recipesQuery.data, search]);

  const onRefresh = useCallback(() => {
    void recipesQuery.refetch();
  }, [recipesQuery]);

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const renderItem: ListRenderItem<Recipe> = useCallback(
    ({ item }) => (
      <RecipeRow recipe={item} isOpen={openId === item.id} onToggle={() => toggle(item.id)} />
    ),
    [openId, toggle],
  );
  const keyExtractor = useCallback((r: Recipe) => r.id, []);
  const separator = useCallback(() => <View style={styles.sep10} />, []);

  return (
    <AppScreen
      title="Recipes"
      subtitle="Read-only recipe reference for prep."
      onRefresh={onRefresh}
      refreshing={recipesQuery.isFetching}
    >
      <View style={styles.searchWrap}>
        <AppText variant="overline">Search</AppText>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Find a recipe…"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
        />
      </View>

      {recipesQuery.isLoading ? (
        <Card>
          <AppText variant="caption">Loading recipes…</AppText>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <AppText variant="heading">No recipes available</AppText>
          <AppText variant="body" faint>
            Ask your admin to link recipes to your store's menu items.
          </AppText>
        </Card>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={separator}
          scrollEnabled={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          removeClippedSubviews
        />
      )}
    </AppScreen>
  );
}

export const RecipesScreen = memo(RecipesScreenImpl);

const styles = StyleSheet.create({
  searchWrap: { gap: 6 },
  rowTitle: { flex: 1 },
  sep10: { height: 10 },
  searchInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailWrap: { gap: 12, marginTop: 8 },
  list: { gap: 6, marginTop: 4 },
});