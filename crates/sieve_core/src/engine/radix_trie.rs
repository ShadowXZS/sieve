//! High-density Radix Trie for N-Gram metric indexing.
//!
//! Architectural Guarantees:
//! - Compact prefix path compression.
//! - Direct &[u8] lookup without heap allocations.
//! - Metrics accumulated at termination nodes.

use hashbrown::HashMap;

#[derive(Copy, Clone, Debug, Default, PartialEq)]
pub struct MetricAggregate {
    pub clicks: u64,
    pub cost: f64,
    pub conversions: f64,
}

impl MetricAggregate {
    #[inline(always)]
    pub fn accumulate(&mut self, clicks: u64, cost: f64, conversions: f64) {
        self.clicks += clicks;
        self.cost += cost;
        self.conversions += conversions;
    }
}

pub struct RadixTrieNode {
    pub prefix: Box<[u8]>,
    pub metrics: Option<MetricAggregate>,
    pub children: HashMap<u8, RadixTrieNode>,
}

impl RadixTrieNode {
    pub fn new(prefix: &[u8]) -> Self {
        Self {
            prefix: Box::from(prefix),
            metrics: None,
            children: HashMap::new(),
        }
    }
}

pub struct RadixTrie {
    root: RadixTrieNode,
}

impl Default for RadixTrie {
    fn default() -> Self {
        Self::new()
    }
}

impl RadixTrie {
    pub fn new() -> Self {
        Self {
            root: RadixTrieNode::new(b""),
        }
    }

    pub fn insert_or_accumulate(&mut self, key: &[u8], clicks: u64, cost: f64, conversions: f64) {
        if key.is_empty() {
            return;
        }

        let mut curr = &mut self.root;
        let mut remaining = key;

        while !remaining.is_empty() {
            let first_byte = remaining[0];
            if !curr.children.contains_key(&first_byte) {
                let mut child = RadixTrieNode::new(remaining);
                child.metrics = Some(MetricAggregate {
                    clicks,
                    cost,
                    conversions,
                });
                curr.children.insert(first_byte, child);
                return;
            }

            let child = curr.children.get_mut(&first_byte).unwrap();
            let common_len = child
                .prefix
                .iter()
                .zip(remaining.iter())
                .take_while(|(&a, &b)| a == b)
                .count();

            if common_len == child.prefix.len() {
                remaining = &remaining[common_len..];
                if remaining.is_empty() {
                    if let Some(m) = &mut child.metrics {
                        m.accumulate(clicks, cost, conversions);
                    } else {
                        child.metrics = Some(MetricAggregate {
                            clicks,
                            cost,
                            conversions,
                        });
                    }
                    return;
                }
                curr = child;
            } else {
                // Split child edge
                let child_prefix = child.prefix.clone();
                let mut split_node = RadixTrieNode::new(&child_prefix[common_len..]);
                split_node.metrics = child.metrics.take();
                core::mem::swap(&mut split_node.children, &mut child.children);

                child.prefix = Box::from(&child_prefix[..common_len]);
                let split_first_byte = split_node.prefix[0];
                child.children.insert(split_first_byte, split_node);

                remaining = &remaining[common_len..];
                if remaining.is_empty() {
                    child.metrics = Some(MetricAggregate {
                        clicks,
                        cost,
                        conversions,
                    });
                } else {
                    let mut new_child = RadixTrieNode::new(remaining);
                    new_child.metrics = Some(MetricAggregate {
                        clicks,
                        cost,
                        conversions,
                    });
                    child.children.insert(remaining[0], new_child);
                }
                return;
            }
        }
    }
}
